// =====================================================================
//  App settings — fill these after creating the free Supabase project.
//  While SUPABASE_URL is empty the app runs in DEMO mode (data saved
//  only in this browser) so you can try it before setting anything up.
// =====================================================================
window.APP_CONFIG = {
  APP_NAME: 'Field Visits',
  COMPANY_NAME: 'Your Company',

  // Supabase -> Project Settings -> API
  SUPABASE_URL: 'https://kufkalytbebojthxthuj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1ZmthbHl0YmVib2p0aHh0aHVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMjkxMjgsImV4cCI6MjEwNzcwNTEyOH0.L2kphZ2m9REh9-4g6sWHLLMvtonS2yreUOe48M-QSMQ',

  // Web-push public key (see SETUP guide, step 5). Leave empty to skip push.
  VAPID_PUBLIC_KEY: '',

  // Reminders are sent this many days before the follow-up date (and on the day itself)
  REMIND_DAYS_BEFORE: 2,

  // Week starts on Saturday (6). Use 0 for Sunday, 1 for Monday.
  WEEK_START: 6,
};
