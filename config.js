window.BAUER_CONFIG = {
  APP_VERSION: '20260909-1',
  APP_URL: 'https://evekeepslearning.github.io/bauer-roofing-mission-control/',
  SUPABASE_URL: 'https://eufimdrdimpkzowlupre.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_F-nEDaSaUQPwy2rTKy71LA_H4gxArBt',
  GOOGLE_MAPS_API_KEY: 'AIzaSyB4xjCbhk3FOUAPVl-80_hGH4qqXKYicVQ'
};

document.addEventListener('DOMContentLoaded', () => {
  const contactsButton = document.querySelector('#nav button[data-view="leads"]');
  if (contactsButton) {
    contactsButton.onclick = event => {
      event.preventDefault();
      window.location.href = 'contacts.html?v=20260909-1';
    };
  }
});
