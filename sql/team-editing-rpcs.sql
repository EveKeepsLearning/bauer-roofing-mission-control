
-- Generic editing helpers use RLS rather than bypassing it, and preserve actor-specific undo.
CREATE OR REPLACE FUNCTION public.bauer_record_action(p_table text, p_id uuid, p_action text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if p_table not in ('tasks','phone_messages','prospects','leads','jobs','appointments','incoming') then
    raise exception 'Unsupported entity type: %', p_table;
  end if;

  if p_action not in ('delete','archive','restore') then
    raise exception 'Unsupported record action: %', p_action;
  end if;

  execute format(
    'select to_jsonb(t) from public.%I t where t.id = $1 and t.deleted_at is null',
    p_table
  ) into v_before using p_id;

  if v_before is null then
    raise exception 'Record not found.';
  end if;

  if p_action = 'delete' then
    execute format(
      'update public.%I set deleted_at = now() where id = $1',
      p_table
    ) using p_id;

  elsif p_action = 'archive' then
    if p_table = 'prospects' then
      execute 'update public.prospects set archived_at = now(), archive_flag = true where id = $1'
        using p_id;
    else
      execute format(
        'update public.%I set archived_at = now() where id = $1',
        p_table
      ) using p_id;
    end if;

  elsif p_action = 'restore' then
    if p_table = 'prospects' then
      execute 'update public.prospects set archived_at = null, archive_flag = false where id = $1'
        using p_id;
    else
      execute format(
        'update public.%I set archived_at = null where id = $1',
        p_table
      ) using p_id;
    end if;
  end if;

  execute format(
    'select to_jsonb(t) from public.%I t where t.id = $1',
    p_table
  ) into v_after using p_id;

  insert into public.undo_history(
    owner_id, action_type, entity_type, entity_id, description, payload
  ) values (
    auth.uid(), p_action, p_table, p_id, p_description,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return v_after;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bauer_restore_snapshot(p_table text, p_id uuid, p_snapshot jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_set_clause text;
begin
  if p_table not in ('tasks','phone_messages','prospects','leads','jobs','appointments','incoming') then
    raise exception 'Unsupported entity type: %', p_table;
  end if;

  select string_agg(format('%I = r.%I', column_name, column_name), ', ' order by ordinal_position)
    into v_set_clause
  from information_schema.columns
  where table_schema = 'public'
    and table_name = p_table
    and column_name not in ('id','owner_id');

  if v_set_clause is null then
    raise exception 'Could not build restore statement for %', p_table;
  end if;

  execute format(
    'update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2',
    p_table,
    v_set_clause,
    p_table
  )
  using p_snapshot, p_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bauer_update_record(p_table text, p_id uuid, p_patch jsonb, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_merged jsonb;
begin
  if p_table not in ('tasks','phone_messages','prospects','leads','jobs','appointments','incoming') then
    raise exception 'Unsupported entity type: %', p_table;
  end if;

  execute format(
    'select to_jsonb(t) from public.%I t where t.id = $1 and t.deleted_at is null',
    p_table
  ) into v_before using p_id;

  if v_before is null then
    raise exception 'Record not found.';
  end if;

  -- Keep identity/ownership fixed even if a client patch accidentally includes them.
  v_merged := v_before || coalesce(p_patch, '{}'::jsonb);
  v_merged := jsonb_set(v_merged, '{id}', to_jsonb(p_id), true);
  v_merged := jsonb_set(v_merged, '{owner_id}', v_before->'owner_id', true);

  -- Use updated_at when the target table has that column.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = 'updated_at'
  ) then
    v_merged := jsonb_set(v_merged, '{updated_at}', to_jsonb(now()), true);
  end if;

  perform public.bauer_restore_snapshot(p_table, p_id, v_merged);

  execute format(
    'select to_jsonb(t) from public.%I t where t.id = $1',
    p_table
  ) into v_after using p_id;

  insert into public.undo_history(
    owner_id, action_type, entity_type, entity_id, description, payload
  ) values (
    auth.uid(), 'update', p_table, p_id, p_description,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return v_after;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.undo_last_action()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_action public.undo_history%rowtype;
  v_before jsonb;
  v_prospect_before jsonb;
  v_lead_id uuid;
  v_appointment_id uuid;
  v_communication_id uuid;
  v_new_callback_task_id uuid;
  v_old_callback_task_before jsonb;
  v_old_callback_task_id uuid;
begin
  select * into v_action
  from public.undo_history
  where owner_id = auth.uid() and undone_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Nothing to undo.');
  end if;

  if v_action.action_type in ('update','delete','archive','restore') then
    v_before := v_action.payload -> 'before';
    if v_before is null then raise exception 'Undo snapshot is missing.'; end if;
    perform public.bauer_restore_snapshot(v_action.entity_type, v_action.entity_id, v_before);

  elsif v_action.action_type = 'task_action' then
    v_before := v_action.payload -> 'before';
    if v_before is null then raise exception 'Undo snapshot is missing.'; end if;
    perform public.bauer_restore_snapshot('tasks', v_action.entity_id, v_before);
    if v_action.payload ? 'other_task_before'
       and (v_action.payload -> 'other_task_before') is not null then
      perform public.bauer_restore_snapshot(
        'tasks',
        nullif(v_action.payload -> 'other_task_before' ->> 'id', '')::uuid,
        v_action.payload -> 'other_task_before'
      );
    end if;

  elsif v_action.action_type = 'create' then
    execute format(
      'update public.%I set deleted_at = now() where id = $1',
      v_action.entity_type
    ) using v_action.entity_id;

  elsif v_action.action_type = 'promote_prospect' then
    v_prospect_before := v_action.payload -> 'prospect_before';
    v_lead_id := nullif(v_action.payload ->> 'lead_id', '')::uuid;
    v_appointment_id := nullif(v_action.payload ->> 'appointment_id', '')::uuid;
    if v_prospect_before is not null then
      perform public.bauer_restore_snapshot('prospects', v_action.entity_id, v_prospect_before);
    end if;
    if v_lead_id is not null then
      update public.leads set deleted_at = now()
      where id = v_lead_id;
    end if;
    if v_appointment_id is not null then
      update public.appointments set deleted_at = now()
      where id = v_appointment_id;
    end if;

  elsif v_action.action_type = 'angi_outcome' then
    v_before := v_action.payload -> 'before';
    if v_before is null then raise exception 'Undo snapshot is missing.'; end if;

    -- Remove the communication created by this quick result.
    v_communication_id := nullif(v_action.payload ->> 'communication_id', '')::uuid;
    if v_communication_id is not null then
      delete from public.sales_communications
      where id = v_communication_id;
    end if;

    -- Remove the newly-created callback task, if the action created one.
    v_new_callback_task_id := nullif(v_action.payload ->> 'new_callback_task_id', '')::uuid;
    if v_new_callback_task_id is not null then
      update public.tasks
      set deleted_at = now()
      where id = v_new_callback_task_id;
    end if;

    -- Restore the previous callback task if a reschedule had retired it.
    v_old_callback_task_before := v_action.payload -> 'old_callback_task_before';
    if v_old_callback_task_before is not null
       and jsonb_typeof(v_old_callback_task_before) = 'object' then
      v_old_callback_task_id := nullif(v_old_callback_task_before ->> 'id', '')::uuid;
      if v_old_callback_task_id is not null then
        perform public.bauer_restore_snapshot(
          'tasks', v_old_callback_task_id, v_old_callback_task_before
        );
      end if;
    end if;

    -- Finally restore the prospect exactly to its prior state.
    perform public.bauer_restore_snapshot('prospects', v_action.entity_id, v_before);

  else
    raise exception 'Unsupported undo action: %', v_action.action_type;
  end if;

  update public.undo_history
  set undone_at = now()
  where id = v_action.id;

  return jsonb_build_object(
    'ok', true,
    'message', coalesce(v_action.description, 'Last action undone.'),
    'action_type', v_action.action_type,
    'entity_type', v_action.entity_type,
    'entity_id', v_action.entity_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.angi_mark_historical_import(p_prospect_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_row jsonb;
begin
  update public.prospects
  set historical_import = true,
      initial_contact_eligible = false,
      initial_contact_suppressed_reason = 'Historical import - never auto-send initial contact',
      updated_at = now()
  where id = p_prospect_id
   ;

  if not found then
    raise exception 'Prospect not found.';
  end if;

  -- Belt-and-suspenders protection: cancel any unsent initial-contact queue rows.
  update public.contact_automation_queue
  set status = 'Cancelled',
      processed_at = now(),
      failure_reason = 'Historical import protection',
      updated_at = now()
  where owner_id = bro_private.workspace_owner()
    and prospect_id = p_prospect_id
    and purpose = 'Initial Angi Contact'
    and status in ('Pending','Processing');

  select to_jsonb(p) into v_row
  from public.prospects p
  where p.id = p_prospect_id;

  return v_row;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.angi_queue_initial_contact(p_prospect_id uuid, p_enable boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_p public.prospects%rowtype;
  v_has_history boolean;
  v_sms_queued boolean := false;
  v_email_queued boolean := false;
  v_is_angi_ads boolean;
begin
  select * into v_p
  from public.prospects
  where id = p_prospect_id
   
    and deleted_at is null;

  if not found then
    raise exception 'Prospect not found.';
  end if;

  if coalesce(p_enable, false) is false then
    update public.prospects
    set initial_contact_eligible = false,
        initial_contact_suppressed_reason = 'Initial-contact automation was not explicitly enabled',
        updated_at = now()
    where id = p_prospect_id;

    return jsonb_build_object('ok', true, 'queued_sms', false, 'queued_email', false, 'reason', 'Not enabled');
  end if;

  if coalesce(v_p.historical_import, false) then
    return jsonb_build_object('ok', true, 'queued_sms', false, 'queued_email', false, 'reason', 'Historical import');
  end if;

  if lower(coalesce(v_p.source,'')) <> 'angi'
     and lower(coalesce(v_p.source_account,'')) not like '%angi%' then
    return jsonb_build_object('ok', true, 'queued_sms', false, 'queued_email', false, 'reason', 'Not an Angi prospect');
  end if;

  select exists(
    select 1
    from public.sales_communications sc
    where sc.owner_id = bro_private.workspace_owner()
      and sc.prospect_id = p_prospect_id
  ) into v_has_history;

  if coalesce(v_p.attempts_count,0) > 0
     or coalesce(v_p.communication_count,0) > 0
     or v_p.last_attempt_at is not null
     or v_p.last_communication_at is not null
     or v_has_history then
    update public.prospects
    set initial_contact_eligible = false,
        initial_contact_suppressed_reason = 'Prior contact/history exists',
        updated_at = now()
    where id = p_prospect_id;

    return jsonb_build_object('ok', true, 'queued_sms', false, 'queued_email', false, 'reason', 'Prior contact/history exists');
  end if;

  update public.prospects
  set initial_contact_eligible = true,
      initial_contact_suppressed_reason = null,
      updated_at = now()
  where id = p_prospect_id;

  -- Queue initial SMS when we have a usable phone number.
  if nullif(btrim(coalesce(v_p.phone,'')), '') is not null then
    insert into public.contact_automation_queue(
      owner_id, prospect_id, purpose, channel, recipient, template_key, metadata
    ) values (
      auth.uid(), p_prospect_id, 'Initial Angi Contact', 'SMS', v_p.phone,
      'angi_initial_sms',
      jsonb_build_object(
        'customer_name', coalesce(v_p.customer_name, btrim(concat_ws(' ',v_p.first_name,v_p.last_name))),
        'source_account', v_p.source_account,
        'source_reference', v_p.source_reference,
        'work_category', v_p.work_category
      )
    )
    on conflict (owner_id, prospect_id, purpose, channel) do nothing;

    if found then
      v_sms_queued := true;
      update public.prospects
      set initial_text_queued_at = coalesce(initial_text_queued_at, now()),
          updated_at = now()
      where id = p_prospect_id;
    end if;
  end if;

  v_is_angi_ads := lower(coalesce(v_p.source_account,'')) like '%angi ads%';

  -- PPL is already automatically emailed through MarketSharp.
  -- Only Angi Ads gets a Mission Control initial-email queue row.
  if v_is_angi_ads
     and nullif(btrim(coalesce(v_p.email,'')), '') is not null then
    insert into public.contact_automation_queue(
      owner_id, prospect_id, purpose, channel, recipient, template_key, metadata
    ) values (
      auth.uid(), p_prospect_id, 'Initial Angi Contact', 'Email', v_p.email,
      'angi_ads_initial_email',
      jsonb_build_object(
        'customer_name', coalesce(v_p.customer_name, btrim(concat_ws(' ',v_p.first_name,v_p.last_name))),
        'source_account', v_p.source_account,
        'source_reference', v_p.source_reference,
        'work_category', v_p.work_category
      )
    )
    on conflict (owner_id, prospect_id, purpose, channel) do nothing;

    if found then
      v_email_queued := true;
      update public.prospects
      set initial_email_queued_at = coalesce(initial_email_queued_at, now()),
          updated_at = now()
      where id = p_prospect_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'queued_sms', v_sms_queued,
    'queued_email', v_email_queued,
    'historical_import', false
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.angi_record_prospect_outcome(p_prospect_id uuid, p_outcome text, p_next_follow_up_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_comm_id uuid;
  v_status text;
  v_next_action text;
  v_archive boolean := false;
  v_attempts integer;
  v_customer_name text;
  v_old_callback_task_id uuid;
  v_old_callback_task_before jsonb;
  v_new_callback_task_id uuid;
  v_due_date date;
  v_due_time time;
  v_effective_follow_up timestamptz;
begin
  select to_jsonb(p), p.attempts_count,
         coalesce(nullif(p.customer_name,''), nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''), 'Angi prospect'),
         p.callback_task_id
    into v_before, v_attempts, v_customer_name, v_old_callback_task_id
  from public.prospects p
  where p.id = p_prospect_id
   
    and p.deleted_at is null;

  if v_before is null then
    raise exception 'Prospect not found.';
  end if;

  -- Keep a snapshot of the previous callback task, if any, for Undo.
  if v_old_callback_task_id is not null then
    select to_jsonb(t) into v_old_callback_task_before
    from public.tasks t
    where t.id = v_old_callback_task_id
     ;
  end if;

  if p_outcome in ('No Answer','Left Voicemail') then
    v_status := 'Attempting Contact';
    v_next_action := case
      when coalesce(v_attempts,0) + 1 >= 5 then 'Choose final outcome'
      else 'Continue Angi cadence'
    end;
    v_effective_follow_up := p_next_follow_up_at;

  elsif p_outcome = 'Spoke With Customer' then
    v_status := 'Connected';
    v_next_action := 'Determine next step';
    v_effective_follow_up := p_next_follow_up_at;

  elsif p_outcome in ('Phone Disconnected / Not Working','Phone Disconnected','Phone Not Working') then
    -- Important: this does NOT archive or remove the prospect from the queue.
    v_status := 'Attempting Contact';
    v_next_action := case
      when nullif(btrim(coalesce(v_before ->> 'email','')), '') is not null then 'Text or email customer'
      else 'Try alternate contact method'
    end;
    v_effective_follow_up := coalesce(p_next_follow_up_at, now());

  elsif p_outcome = 'Call Back Later' then
    if p_next_follow_up_at is null then
      raise exception 'Choose a callback date and time.';
    end if;
    v_status := 'Waiting on Callback';
    v_next_action := 'Call customer at promised callback time';
    v_effective_follow_up := p_next_follow_up_at;

  elsif p_outcome in ('Not Interested','Went Elsewhere','Went With Another Company','No Longer Needs Service','Unable to Reach','Bad / Invalid Lead','Bad/Invalid Lead','Duplicate/Existing Customer') then
    v_status := p_outcome;
    v_next_action := null;
    v_archive := true;
    v_effective_follow_up := null;

  else
    raise exception 'Unknown Angi outcome: %', p_outcome;
  end if;

  -- If this is a new callback, retire the previous open callback task first.
  if p_outcome = 'Call Back Later' and v_old_callback_task_id is not null then
    update public.tasks
    set deleted_at = now()
    where id = v_old_callback_task_id
     
      and deleted_at is null
      and status not in ('Completed','Skipped');
  end if;

  -- Create the promised-callback task as CRUCIAL.
  if p_outcome = 'Call Back Later' then
    v_due_date := (p_next_follow_up_at at time zone 'America/New_York')::date;
    v_due_time := (p_next_follow_up_at at time zone 'America/New_York')::time;

    insert into public.tasks(
      owner_id,
      task,
      description,
      category,
      task_type,
      status,
      base_priority,
      due_date,
      due_time,
      next_action,
      notes,
      prospect_id,
      related_number
    ) values (
      auth.uid(),
      'Call ' || v_customer_name || ' - Angi callback',
      'Customer requested or was promised a callback at this specific time.',
      'Customer Follow-Up',
      'One-Time',
      'Not Started',
      'Crucial',
      v_due_date,
      v_due_time,
      'Call customer at scheduled callback time',
      nullif(p_notes,''),
      p_prospect_id,
      nullif(v_before ->> 'source_reference','')
    )
    returning id into v_new_callback_task_id;
  end if;

  update public.prospects
  set current_status = v_status,
      attempts_count = coalesce(attempts_count,0) + 1,
      last_attempt_at = now(),
      last_result = case
        when p_outcome in ('Phone Disconnected','Phone Not Working') then 'Phone Disconnected / Not Working'
        when p_outcome = 'Went With Another Company' then 'Went Elsewhere'
        when p_outcome = 'Bad / Invalid Lead' then 'Bad/Invalid Lead'
        else p_outcome
      end,
      call_usable = case
        when p_outcome in ('Phone Disconnected / Not Working','Phone Disconnected','Phone Not Working') then false
        else call_usable
      end,
      phone_issue_note = case
        when p_outcome in ('Phone Disconnected / Not Working','Phone Disconnected','Phone Not Working')
          then coalesce(nullif(p_notes,''), 'Phone disconnected or not working')
        else phone_issue_note
      end,
      manual_next_follow_up_at = case
        when p_outcome = 'Call Back Later' then p_next_follow_up_at
        else manual_next_follow_up_at
      end,
      cadence_next_follow_up_at = case
        when p_outcome in ('No Answer','Left Voicemail') then p_next_follow_up_at
        else cadence_next_follow_up_at
      end,
      next_follow_up_at = v_effective_follow_up,
      next_action = v_next_action,
      last_communication_at = now(),
      communication_count = coalesce(communication_count,0) + 1,
      callback_task_id = case
        when p_outcome = 'Call Back Later' then v_new_callback_task_id
        when v_archive then null
        else callback_task_id
      end,
      archive_flag = case when v_archive then true else archive_flag end,
      archived_at = case when v_archive then now() else archived_at end,
      updated_at = now()
  where id = p_prospect_id
   ;

  insert into public.sales_communications(
    owner_id, prospect_id, occurred_at, communication_type, direction,
    attempt_number, result, notes, next_follow_up_at, recorded_by
  ) values (
    auth.uid(), p_prospect_id, now(), 'Call', 'Outbound',
    coalesce(v_attempts,0) + 1,
    case
      when p_outcome in ('Phone Disconnected','Phone Not Working') then 'Phone Disconnected / Not Working'
      when p_outcome = 'Went With Another Company' then 'Went Elsewhere'
      when p_outcome = 'Bad / Invalid Lead' then 'Bad/Invalid Lead'
      else p_outcome
    end,
    nullif(p_notes,''), v_effective_follow_up, 'Mission Control'
  ) returning id into v_comm_id;

  insert into public.undo_history(
    owner_id, action_type, entity_type, entity_id, description, payload
  ) values (
    auth.uid(), 'angi_outcome', 'prospects', p_prospect_id,
    'Angi result undone.',
    jsonb_build_object(
      'before', v_before,
      'communication_id', v_comm_id,
      'new_callback_task_id', v_new_callback_task_id,
      'old_callback_task_before', v_old_callback_task_before
    )
  );

  select to_jsonb(p) into v_after
  from public.prospects p
  where p.id = p_prospect_id;

  return jsonb_build_object(
    'prospect', v_after,
    'communication_id', v_comm_id,
    'callback_task_id', v_new_callback_task_id,
    'auto_advance', true
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bro_move_inquiry_contact(p_inquiry_id uuid, p_contact_id uuid, p_expected_updated_at timestamp with time zone, p_job_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare l public.leads%rowtype; c public.contacts%rowtype; n integer; wanted integer;
begin
 if auth.uid() is null then raise exception 'Sign in before moving an inquiry.'; end if;
 select * into l from public.leads where id=p_inquiry_id and owner_id=bro_private.workspace_owner() and deleted_at is null for update;
 if not found then raise exception 'Inquiry not found or not accessible.'; end if;
 if l.updated_at is distinct from p_expected_updated_at then raise exception 'Inquiry changed. Close this dialog, reload, and review again.'; end if;
 select * into c from public.contacts where id=p_contact_id and owner_id=bro_private.workspace_owner() for share;
 if not found then raise exception 'Target contact not found or not accessible.'; end if;
 if l.contact_id=c.id then raise exception 'This inquiry already belongs to that contact.'; end if;
 select count(distinct x) into wanted from unnest(coalesce(p_job_ids,'{}'::uuid[])) x;
 perform id from public.jobs where id=any(coalesce(p_job_ids,'{}'::uuid[])) and owner_id=bro_private.workspace_owner() and deleted_at is null and lead_id=l.id for update;
 get diagnostics n=row_count;
 if n<>wanted then raise exception 'A selected job is no longer linked to this inquiry or is not accessible. Review again.'; end if;
 update public.leads set contact_id=c.id,homeowner_name=c.name,phone=c.phone,email=c.email,updated_at=now() where id=l.id and owner_id=bro_private.workspace_owner();
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Inquiry could not be moved.'; end if;
 update public.jobs set customer_id=c.id,customer_name=c.name,updated_at=now() where id=any(coalesce(p_job_ids,'{}'::uuid[])) and owner_id=bro_private.workspace_owner() and lead_id=l.id;
 get diagnostics n=row_count;
 if n<>wanted then raise exception 'Selected jobs could not be moved.'; end if;
 return jsonb_build_object('inquiry_id',l.id,'contact_id',c.id,'jobs_moved',n);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bro_merge_contacts(p_keep uuid, p_merge uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_keep public.contacts%rowtype;
  v_merge public.contacts%rowtype;
begin
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different contacts to merge.';
  end if;

  select * into v_keep from public.contacts where id = p_keep and owner_id=bro_private.workspace_owner();
  if not found then raise exception 'Main contact not found.'; end if;
  select * into v_merge from public.contacts where id = p_merge and owner_id=bro_private.workspace_owner();
  if not found then raise exception 'Duplicate contact not found.'; end if;

  update public.contacts
     set phone = coalesce(nullif(phone,''), nullif(v_merge.phone,'')),
         email = coalesce(nullif(email,''), nullif(v_merge.email,'')),
         street_address = coalesce(nullif(street_address,''), nullif(v_merge.street_address,'')),
         city = coalesce(nullif(city,''), nullif(v_merge.city,'')),
         state = coalesce(nullif(state,''), nullif(v_merge.state,'')),
         zip = coalesce(nullif(zip,''), nullif(v_merge.zip,'')),
         notes = case
           when nullif(notes,'') is null then v_merge.notes
           when nullif(v_merge.notes,'') is null then notes
           when position(v_merge.notes in notes) > 0 then notes
           else notes || E'\n' || v_merge.notes
         end,
         updated_at = now()
   where id = p_keep and owner_id=bro_private.workspace_owner();

  update public.leads set contact_id = p_keep, homeowner_name = v_keep.name, updated_at = now()
   where contact_id = p_merge and owner_id=bro_private.workspace_owner();
  update public.jobs set customer_id = p_keep, customer_name = v_keep.name
   where customer_id = p_merge and owner_id=bro_private.workspace_owner();
  update public.appointment_notification_queue set contact_id = p_keep
   where contact_id = p_merge and owner_id=bro_private.workspace_owner();
  update public.communications set contact_id = p_keep
   where contact_id = p_merge and owner_id=bro_private.workspace_owner();
  update public.contact_communications set contact_id = p_keep
   where contact_id = p_merge and owner_id=bro_private.workspace_owner();
  update public.job_communications set contact_id = p_keep
   where contact_id = p_merge and owner_id=bro_private.workspace_owner();
  update public.sales_communications set contact_id = p_keep
   where contact_id = p_merge and owner_id=bro_private.workspace_owner();
  update public.tasks set related_contact_id = p_keep
   where related_contact_id = p_merge and owner_id=bro_private.workspace_owner();

  delete from public.contacts where id = p_merge and owner_id=bro_private.workspace_owner();

  return jsonb_build_object('kept_contact_id',p_keep,'merged_contact_id',p_merge);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bro_merge_inquiries(p_keep uuid, p_merge uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := bro_private.workspace_owner();
  v_keep_number text;
  v_keep_contact uuid;
  v_merge_contact uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_keep is null or p_merge is null or p_keep = p_merge then
    raise exception 'Choose two different inquiries';
  end if;

  select lead_number, contact_id into v_keep_number, v_keep_contact
  from public.leads
  where id = p_keep and owner_id = v_uid and deleted_at is null;
  if not found then raise exception 'Main inquiry not found'; end if;
  if coalesce(trim(v_keep_number),'') = '' then raise exception 'Main inquiry must already have an inquiry number'; end if;

  select contact_id into v_merge_contact
  from public.leads
  where id = p_merge and owner_id = v_uid and deleted_at is null;
  if not found then raise exception 'Duplicate inquiry not found'; end if;

  update public.appointments set lead_id = p_keep, updated_at = now() where lead_id = p_merge and owner_id = v_uid;
  update public.appointment_notification_queue set lead_id = p_keep where lead_id = p_merge and owner_id = v_uid;
  update public.communications set lead_id = p_keep, lead_number = v_keep_number where lead_id = p_merge and owner_id = v_uid;
  update public.contact_communications set lead_id = p_keep where lead_id = p_merge and owner_id = v_uid;
  update public.jobs set lead_id = p_keep, lead_number = v_keep_number, updated_at = now() where lead_id = p_merge and owner_id = v_uid;
  update public.phone_messages set lead_id = p_keep, lead_number = v_keep_number where lead_id = p_merge and owner_id = v_uid;
  update public.roy_appointment_outcomes set lead_id = p_keep where lead_id = p_merge;
  update public.roy_estimate_updates set lead_id = p_keep where lead_id = p_merge;
  update public.sales_communications set lead_id = p_keep where lead_id = p_merge and owner_id = v_uid;
  update public.tasks set lead_id = p_keep, lead_number = v_keep_number, updated_at = now() where lead_id = p_merge and owner_id = v_uid;

  if v_keep_contact is null and v_merge_contact is not null then
    update public.leads set contact_id = v_merge_contact, updated_at = now() where id = p_keep and owner_id = v_uid;
  end if;

  update public.leads
  set deleted_at = now(), archived_at = coalesce(archived_at, now()), lead_status = 'Merged', sales_stage = 'Merged', updated_at = now()
  where id = p_merge and owner_id = v_uid;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bootstrap_bauer_data()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v uuid:=auth.uid(); sop_angi uuid; sop_vm uuid; sop_email uuid; sop_pay uuid; sop_wht uuid; sop_cc uuid; wf_angi uuid;
begin
  if v is null then raise exception 'Not signed in'; end if;
  if bro_private.workspace_owner() is distinct from v then return 'Team workspace ready'; end if;
  insert into public.settings(owner_id,setting,value,description) values
    (v,'Company Name','Bauer Roofing','Display name'),(v,'Timezone','America/New_York','Primary work timezone'),(v,'Default Assignee','Eve','Default responsible person'),(v,'Workday Start','08:00','Recommendation window'),(v,'Workday End','17:00','Recommendation window') on conflict(owner_id,setting) do nothing;

  insert into public.sops(owner_id,code,title,category,purpose,when_to_use,prerequisites,instructions,how_to_verify) values
    (v,'SOP-ANGI','Angi Prospect and Appointment Processing','Leads','Convert Angi prospects into correctly documented appointments','When checking/following Angi prospects','Both Angi accounts, Bauer lead spreadsheet, MarketSharp, Google Calendar','DRAFT: Contact prospect; book appointment; add appointment to Bauer master spreadsheet and obtain lead number; enter/update MarketSharp using lead number; add appointment to Google Calendar; verify systems agree.','Verify Bauer spreadsheet lead number, MarketSharp, and Google Calendar agree.'),
    (v,'SOP-VM','Morning Voicemail Review','Phone','Ensure overnight callers are not missed','Morning startup',null,'DRAFT: Check voicemail; capture phone message; return or route calls; create follow-up when needed.','No unresolved overnight message is left uncaptured.'),
    (v,'SOP-EMAIL','Email Triage','Email','Capture actionable email work without losing current priorities','Throughout workday',null,'DRAFT: Review email, respond when quick, create/route task when follow-up is needed.','Actionable email has response, task, or waiting status.'),
    (v,'SOP-PAYROLL','Friday Payroll','Payroll','Process Bauer Roofing payroll','Friday afternoon after Thursday-Wednesday payroll week closes',null,'DRAFT: Exact QuickBooks payroll steps to be documented after training.','Confirm payroll processed successfully and withholding obligation is ready for next cycle.'),
    (v,'SOP-WHT','Weekly Payroll Withholding Taxes','Payroll','Pay required federal and state payroll withholding taxes','Wednesday morning after payroll is complete','Prior payroll must be complete','DRAFT: Exact payment portals/steps to be documented.','Verify confirmation/reference numbers and payment status.'),
    (v,'SOP-CC','Monthly Credit Card Payments','Accounting','Pay all company credit card bills before month end','Month-end accounting cycle',null,'DRAFT: Maintain card checklist; pay each card; record confirmation; update progress.','All cards show paid/confirmation and progress equals total.') on conflict(owner_id,code) do nothing;
  select id into sop_angi from public.sops where owner_id=v and code='SOP-ANGI'; select id into sop_vm from public.sops where owner_id=v and code='SOP-VM'; select id into sop_email from public.sops where owner_id=v and code='SOP-EMAIL'; select id into sop_pay from public.sops where owner_id=v and code='SOP-PAYROLL'; select id into sop_wht from public.sops where owner_id=v and code='SOP-WHT'; select id into sop_cc from public.sops where owner_id=v and code='SOP-CC';

  insert into public.workflows(owner_id,code,workflow_name,applies_to,trigger_description,active,sop_id,notes) values(v,'WF-ANGI','Angi Prospect to Appointment','Prospect / Appointment','Prospect becomes an appointment',true,sop_angi,'Preserves Bauer workflow across spreadsheet, MarketSharp, and Google Calendar') on conflict(owner_id,code) do nothing;
  select id into wf_angi from public.workflows where owner_id=v and code='WF-ANGI';
  if not exists(select 1 from public.workflow_steps where owner_id=v and workflow_id=wf_angi) then
    insert into public.workflow_steps(owner_id,workflow_id,step_order,step,required,creates_task,default_priority,sop_id) values
      (v,wf_angi,1,'Contact prospect',true,true,'High',sop_angi),(v,wf_angi,2,'Book appointment',true,true,'High',sop_angi),(v,wf_angi,3,'Add appointment to Bauer master spreadsheet and obtain lead number',true,true,'High',sop_angi),(v,wf_angi,4,'Enter/update MarketSharp using lead number',true,true,'High',sop_angi),(v,wf_angi,5,'Add appointment to Google Calendar',true,true,'High',sop_angi),(v,wf_angi,6,'Verify all systems match',true,true,'High',sop_angi);
  end if;

  insert into public.recurring_rules(owner_id,code,task,category,frequency,time_of_day,due_time,base_priority,escalate_days_before,critical_on_due_date,sop_id,notes) values
    (v,'RR-001','Check both Angi accounts for new prospects','Leads','Daily','08:00','08:15','High',0,true,sop_angi,'Morning lead check'),
    (v,'RR-002','Call Angi prospects due for follow-up - morning','Leads','Daily','08:15','10:00','High',0,true,sop_angi,'Only prospects currently due in cadence'),
    (v,'RR-003','Call Angi prospects due for follow-up - noon','Leads','Daily','12:00','13:00','High',0,true,sop_angi,'Only prospects currently due in cadence'),
    (v,'RR-004','Call Angi prospects due for follow-up - late afternoon','Leads','Daily','16:30','17:15','High',0,true,sop_angi,'Flexible between 4:30 and 5:00'),
    (v,'RR-005','Check overnight voicemails and return needed calls','Phone','Daily','08:00','09:00','High',0,true,sop_vm,'Morning startup'),
    (v,'RR-006','Review email and capture actionable follow-up','Email','Daily','08:30','17:00','Normal',0,false,sop_email,'Ongoing triage') on conflict(owner_id,code) do nothing;
  insert into public.recurring_rules(owner_id,code,task,category,frequency,weekday,time_of_day,due_time,base_priority,escalate_days_before,critical_on_due_date,sop_id,notes) values
    (v,'RR-PAY','Process Friday payroll','Payroll','Weekly',5,'14:00','17:00','High',0,true,sop_pay,'Payroll week Thursday-Wednesday'),
    (v,'RR-WHT','Pay weekly federal/state payroll withholding taxes','Payroll','Weekly',3,'08:00','12:00','High',1,true,sop_wht,'Critical Wednesday morning after payroll') on conflict(owner_id,code) do nothing;
  insert into public.recurring_rules(owner_id,code,task,category,frequency,day_of_month,time_of_day,due_time,base_priority,escalate_days_before,critical_on_due_date,sop_id,notes) values
    (v,'RR-CC','Pay monthly company credit card bills','Accounting','Monthly',31,'09:00','17:00','High',3,true,sop_cc,'Uses last day of shorter months') on conflict(owner_id,code) do nothing;

  if not exists(select 1 from public.tasks where owner_id=v and task='Finish paying remaining credit card bills') then
    insert into public.tasks(owner_id,task,category,task_type,status,base_priority,next_action,progress_total,estimated_minutes,sop_id,notes) values(v,'Finish paying remaining credit card bills','Accounting','One-Time','In Progress','Critical','Continue with next unpaid card',10,45,sop_cc,'Carried forward from prior work; update progress as cards are completed');
    insert into public.tasks(owner_id,task,category,task_type,status,base_priority,next_action,estimated_minutes,notes) values(v,'Resolve QuickBooks / Intuit administrator permissions issue','IT','Project','Not Started','High','Call Intuit and resolve access/permissions',60,'Blocks direct deposit setup');
  end if;
  if not exists(select 1 from public.tasks where owner_id=v and task='Set up QuickBooks direct deposit') then
    insert into public.tasks(owner_id,task,category,task_type,status,base_priority,next_action,estimated_minutes,notes) values(v,'Set up QuickBooks direct deposit','Payroll','Project','Blocked','High','Complete direct deposit setup after Intuit issue is resolved',60,'Blocked until permissions are corrected');
  end if;
  if not exists(select 1 from public.projects where owner_id=v and project='Remote accounting / software environment stabilization') then
    insert into public.projects(owner_id,project,status,priority,next_action,notes) values(v,'Remote accounting / software environment stabilization','Active','High','Resolve Intuit administrator permissions issue','QuickBooks hosting, remote access, and related setup'),(v,'Document Bauer Roofing operating procedures','Active','Normal','Document each process as it is learned','Build living playbook without delaying daily operations');
  end if;
  return 'OK';
end $function$
;
CREATE OR REPLACE FUNCTION public.normalize_recurring_tasks_to_weekdays()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  update public.tasks
  set due_date = case extract(dow from due_date)
    when 6 then due_date + 2
    when 0 then due_date + 1
    else due_date
  end
  where owner_id = auth.uid() and deleted_at is null
    and status not in ('Completed','Cancelled','Skipped')
    and due_date is not null
    and (recurring_rule_id is not null or repeat_pattern <> 'None')
    and extract(dow from due_date) in (0,6);
  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  with ranked as (
    select id,
           row_number() over (
             partition by coalesce(recurrence_series_id::text, recurring_rule_id::text, lower(task))
             order by (due_date > current_date),
                      case when due_date <= current_date then due_date end desc,
                      due_date asc,
                      created_at desc,
                      id desc
           ) as rn
    from public.tasks
    where owner_id = auth.uid() and deleted_at is null
      and status not in ('Completed','Cancelled','Skipped')
      and (recurring_rule_id is not null or repeat_pattern <> 'None')
  )
  update public.tasks t
  set deleted_at = now()
  from ranked r
  where t.id = r.id and r.rn > 1;
  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end;
$function$
;
