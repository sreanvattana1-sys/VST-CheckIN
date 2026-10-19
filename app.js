// Global Application State
let currentLang = localStorage.getItem('attendance_lang') || 'km';
let publicInfo = null;
let currentStaff = null; // { code, name, role }
let userCoords = { lat: null, lng: null };
let staffScanner = null;
let currentScanAction = 'morning_in'; // 4-slot attendance
let isStaffScannerRunning = false;
let isAdminAuthenticated = false;
let todayScansTotalCount = 0;
let allAdminMembers = [];
let allPendingMembers = [];

// Persistent Device UUID for 1 Staff = 1 Device policy
function getOrCreateDeviceId() {
  try {
    let devId = localStorage.getItem('vst_device_uuid');
    if (!devId) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        devId = 'dev-' + crypto.randomUUID();
      } else {
        devId = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
      }
      localStorage.setItem('vst_device_uuid', devId);
    }
    return devId;
  } catch (e) {
    return 'dev-fallback-' + Math.random().toString(36).substring(2, 10);
  }
}

// Local network IP address display
const currentHost = window.location.host;
const mobileAppUrl = window.location.protocol + '//' + (currentHost.includes('localhost') ? '192.168.1.17:3000' : currentHost);

// ================= I18N DICTIONARY =================
const translations = {
  km: {
    appSubtitle: "ប្រព័ន្ធវត្តមានឌីជីថលឆ្លាតវៃ",
    morningGreeting: "អរុណសួស្តី",
    afternoonGreeting: "ទិវាសួស្តី",
    eveningGreeting: "សាយណ្ហសួស្តី",
    scanSubtitle: "សូមស្កេន QR Code ការិយាល័យ ដើម្បីកត់ត្រាវត្តមានបំពេញការងារ",
    switchStaff: "ប្តូរឈ្មោះ",
    chooseProfileTitle: "សូមជ្រើសរើសឈ្មោះរបស់អ្នក",
    chooseProfileDesc: "ជ្រើសរើសម្តងគត់ ប្រព័ន្ធនឹងចងចាំលើទូរស័ព្ទរបស់អ្នករហូត",
    done: "រួចរាល់",
    checkIn: "ចូល (Check-In)",
    checkOut: "ចេញ (Check-Out)",
    tapToScan: "ចុចស្កេនកាមេរ៉ា",
    heroTitleIn: "ប៉ះប៊ូតុងដើម្បីស្កេនចូលធ្វើការ (Check-In)",
    heroTitleOut: "ប៉ះប៊ូតុងដើម្បីស្កេនចេញពីធ្វើការ (Check-Out)",
    heroDesc: "ប្រព័ន្ធនឹងផ្ទៀងផ្ទាត់ GPS និងផ្ញើដំណឹងស្វ័យប្រវត្តិចូល Telegram",
    gpsWaiting: "កំពុងផ្ទៀងផ្ទាត់ GPS...",
    gpsAllow: "សូមបើក Location Permission",
    inOffice: "នៅក្នុងការិយាល័យ ✅",
    outOffice: "នៅក្រៅបរិវេណការិយាល័យ 📍",
    todayAttendance: "វត្តមានរបស់ខ្ញុំថ្ងៃនេះ",
    notCheckedIn: "មិនទាន់ Check-In",
    onDuty: "🟢 កំពុងបំពេញការងារ",
    checkedOut: "🔴 បាន Check-Out",
    checkInTime: "ម៉ោងចូលធ្វើការ",
    checkOutTime: "ម៉ោងចេញពីធ្វើការ",
    waitingIn: "រង់ចាំការ Check-in",
    waitingOut: "រង់ចាំការ Check-out",
    workHours: "ម៉ោងបំពេញការងារ",
    officialOffice: "ការិយាល័យផ្លូវការ",
    myRecentActivity: "ប្រវត្តិស្កេនថ្មីៗរបស់ខ្ញុំ",
    last5times: "5 ដងចុងក្រោយ",
    loadingData: "កំពុងទាញយកទិន្នន័យ...",
    noDataYet: "មិនទាន់មានប្រវត្តិវត្តមាននៅឡើយទេ",
    guideTitle: "របៀបស្កេនងាយស្រួល",
    guideDesc: "ចុចប៊ូតុងស្កេនធំនៅកណ្តាល រួចចង្អុលកាមេរ៉ាទៅកាន់ QR Code ការិយាល័យដែលបិទលើជញ្ជាំង។ សារជូនដំណឹងនឹងលោតចូល Telegram របស់ថ្នាក់ដឹកនាំភ្លាមៗ។",
    adminPortal: "Admin",
    staffView: "ទំព័របុគ្គលិក",
    lock: "ចាកចេញ (Lock)",
    statTotal: "សមាជិកសរុប",
    statTotalSub: "ក្នុងប្រព័ន្ធទាំងអស់",
    statTodayIn: "ចូលធ្វើការថ្ងៃនេះ",
    statTodayOut: "ចេញពីធ្វើការ",
    statAbsent: "មិនទាន់មក",
    statAbsentSub: "អវត្តមានថ្ងៃនេះ",
    shareWifiTitle: "📱 Link សម្រាប់ឱ្យបុគ្គលិកបើកលើទូរស័ព្ទក្នុង Wi-Fi",
    shareWifiDesc: "បុគ្គលិកគ្រាន់តែបើក Link នេះលើ Safari/Chrome លើទូរស័ព្ទដៃរបស់ពួកគេ",
    copy: "Copy",
    recentLiveFeed: "សកម្មភាពវត្តមានថ្មីៗថ្ងៃនេះ (Live Feed)",
    viewAll: "មើលទាំងអស់ →",
    colMember: "សមាជិក",
    colAction: "សកម្មភាព",
    colTime: "ម៉ោង",
    colLocation: "ទីតាំង Geofence",
    posterTitle: "🖨️ បោះពុម្ព QR Code ការិយាល័យ (Office QR)",
    posterDesc: "បោះពុម្ពសន្លឹក QR នេះបិទលើជញ្ជាំង ឬតុ Reception ដើម្បីឱ្យបុគ្គលិកយកទូរស័ព្ទស្កេន",
    posterScanText: "សូមបើកទូរស័ព្ទដៃ រួចស្កេន QR នេះ",
    printPoster: "បោះពុម្ពសន្លឹក QR នេះ (Print Poster)",
    addNewMember: "បន្ថែមសមាជិកថ្មី",
    filterDate: "កាលបរិច្ឆេទ:",
    exportExcel: "Export Excel/CSV",
    colName: "ឈ្មោះ",
    colPhone: "លេខទូរសព្ទ",
    colEmail: "អ៊ីមែល",
    colCode: "កូដ",
    colRole: "តួនាទី",
    colDistance: "ចម្ងាយ GPS",
    colGeofence: "Geofence",
    enableTelegramAlert: "បើកផ្ញើសារ Alert ពេលបុគ្គលិកស្កេន",
    save: "រក្សាទុក",
    testTelegram: "តេស្តផ្ញើសារ",
    secTitle: "ទីតាំង & សុវត្ថិភាព",
    lblCompanyName: "ឈ្មោះក្រុមហ៊ុន / ស្ថាប័ន",
    lblRadius: "រង្វង់អនុញ្ញាត (Radius ម៉ែត្រ)",
    saveSettings: "រក្សាទុកការកំណត់",
    modalScanPrompt: "ស្កេន QR ការិយាល័យ",
    aimCamera: "សូមចង្អុលកាមេរ៉ាទៅចំកណ្តាល QR Code ការិយាល័យ",
    cancel: "បោះបង់",
    footerPowered: "ប្រព័ន្ធគ្រប់គ្រងវត្តមានឆ្លាតវៃជាមួយ GPS Geofencing & Telegram Bot",
    alertSuccess: "ជោគជ័យ!",
    alertFailed: "ស្កេនមិនជោគជ័យ",
    alertGpsDenied: "មិនអាចចាប់ GPS បានទេ សូមបើក Location Permission",
    alertCopied: "បាន Copy Link រួចរាល់!",
    pinPromptTitle: "🔒 ចូលផ្នែក Admin",
    pinPromptInput: "សូមបញ្ចូលលេខកូដសម្ងាត់ (PIN)",
    confirmBtn: "យល់ព្រម",
    loginPortalSubtitle: "ចូលប្រើប្រាស់",
    tabSignIn: "ចូលប្រើ (Sign In)",
    tabRegister: "ចុះឈ្មោះ",
    lblPhoneOrCode: "លេខទូរសព្ទ ឬ ID",
    phoneOrCodePlaceholder: "បញ្ចូលលេខទូរសព្ទ ឬ ID",
    lblSelectOrInput: "ជ្រើសរើសឈ្មោះបុគ្គលិក",
    orByCode: "ឬ វាយលេខកូដសម្គាល់ ID",
    lblPassword: "លេខសម្ងាត់",
    passwordPlaceholder: "បញ្ចូលលេខសម្ងាត់",
    pwdNotice: "ប្រើលេខសម្ងាត់ដែល Admin បានផ្តល់",
    btnSignIn: "ចូលប្រើ",
    adminRegOnlyTitle: "បុគ្គលិកថ្មីដែលមិនទាន់មានឈ្មោះ?",
    adminRegOnlyDesc: "សូមទាក់ទងថ្នាក់ដឹកនាំ ឬ Admin ដើម្បីចុះឈ្មោះ និងទទួលយក Password ចូលប្រើប្រាស់។",
    addNewMember: "ចុះឈ្មោះសមាជិកបុគ្គលិកថ្មី",
    memberModalSubtitle: "បំពេញព័ត៌មានលម្អិត និងកំណត់លេខកូដសម្ងាត់ Password សម្រាប់ចូលប្រើ",
    secLoginAccess: "ព័ត៌មានគណនី & Password សម្រាប់បុគ្គលិកចូលប្រើ",
    secPersonalInfo: "ព័ត៌មានផ្ទាល់ខ្លួនបុគ្គលិក (Personal Profile)",
    secWorkInfo: "ព័ត៌មានការងារ & កិច្ចសន្យា (Employment Info)",
    colPassword: "លេខកូដសម្ងាត់ (Password) *",
    colGender: "ភេទ (Gender)",
    colDob: "ថ្ងៃខែឆ្នាំកំណើត",
    colNationalId: "អត្តសញ្ញាណប័ណ្ណ / Passport",
    colEmergency: "លេខទំនាក់ទំនងបន្ទាន់",
    colAddress: "អាសយដ្ឋានបច្ចុប្បន្ន",
    colJoinDate: "កាលបរិច្ឆេទចូលធ្វើការ",
    colSalaryType: "ប្រភេទប្រាក់បៀវត្ស",
    colNotes: "កំណត់សម្គាល់បន្ថែម",
    logout: "ចាកចេញ",
    slotMorningIn: "1. ព្រឹកចូល (08:00)",
    slotLunchOut: "2. សម្រាកបាយ (11:00)",
    slotAfternoonIn: "3. ចូលវិញ (13:00)",
    slotEveningOut: "4. ល្ងាចចេញ (17:00)",
    slotTitleMorning: "ប៉ះប៊ូតុងដើម្បីស្កេន ព្រឹកចូលធ្វើការ (Scan 1/4)",
    slotTitleLunch: "ប៉ះប៊ូតុងដើម្បីស្កេន ចេញសម្រាកបាយ (Scan 2/4)",
    slotTitleAfternoon: "ប៉ះប៊ូតុងដើម្បីស្កេន ចូលធ្វើការវិញ (Scan 3/4)",
    slotTitleEvening: "ប៉ះប៊ូតុងដើម្បីស្កេន ល្ងាចចេញពីធ្វើការ (Scan 4/4)",
    scheduleBadge: "ចន្ទ - សៅរិ៍",
    sundayOffBadge: "🏖️ ថ្ងៃអាទិត្យសម្រាកការងារ (Sunday Off / OT)",
    scanProgress: "ស្កេន:",
    allScansCompleted: "✨ គ្រប់ 4 ដងថ្ងៃនេះហើយ!",
    slot1Title: "1. ព្រឹកចូល",
    slot2Title: "2. សម្រាកបាយ",
    slot3Title: "3. ចូលវិញ",
    slot4Title: "4. ល្ងាចចេញ",
    nextScanLbl: "ស្កេនបន្ទាប់:",
    waiting: "រង់ចាំ",
    doneSlot: "រួចរាល់",
    selfRegTitle: "មិនទាន់មានគណនី?",
    selfRegDesc: "បង្កើតគណនីថ្មី រួចរង់ចាំ Admin អនុម័ត។",
    btnSelfRegister: "បង្កើតគណនីថ្មី",
    pendingApprovalTitle: "សំណើសុំចុះឈ្មោះរង់ចាំការអនុម័ត (Pending Approvals)",
    generalSettings: "ការកំណត់ទូទៅ",
    languageLabel: "ភាសា",
    themesLabel: "រចនាបថ និងពណ៌",
    fontsLabel: "ពុម្ពអក្សរខ្មែរ",
    themeModalTitle: "រចនាបថ និងពណ៌",
    themeModalDesc: "ជ្រើសរើសទម្រង់ UI និងពណ៌ដែលអ្នកពេញចិត្ត",
    uiStyleTitle: "ទម្រង់ UI",
    colorThemeTitle: "ពណ៌ Theme",
    doneTheme: "រួចរាល់",
    fontModalTitle: "ពុម្ពអក្សរខ្មែរ",
    fontModalDesc: "ជ្រើសរើសពុម្ពអក្សរដែលងាយអាន និងសមនឹងអ្នក",
    recommended: "ណែនាំ",
    requestLeave: "សុំច្បាប់ ឬមកយឺត",
    myRequests: "ស្ថានភាពសំណើរបស់ខ្ញុំ",
    myAttendance: "កំណត់ត្រាវត្តមានរបស់ខ្ញុំ",
    adminSystem: "ប្រព័ន្ធគ្រប់គ្រង",
    adminPortalLabel: "ចូលផ្នែក Admin",
    companyTelegram: "Telegram ក្រុមហ៊ុន",
    teamOverviewTitle: "ស្ថិតិក្រុមការងារ",
    teamMembersLabel: "សមាជិកសរុប",
    teamPresentLabel: "មានវត្តមានថ្ងៃនេះ",
    rankingTitle: "ចំណាត់ថ្នាក់គោរពពេលវេលា",
    thisWeek: "សប្ដាហ៍",
    thisMonth: "ខែ",
    rankingRule: "ពិន្ទុ = កត់ត្រាទាន់ម៉ោង ១ ពិន្ទុ/វេន + បំពេញ ៤ វេន ២ ពិន្ទុ/ថ្ងៃ។ ការចុចស្ទួនមិនបន្ថែមពិន្ទុ។",
    regNameKm: "ឈ្មោះជាភាសាខ្មែរ",
    regNameLatin: "ឈ្មោះជាអក្សរឡាតាំង",
    regDob: "ថ្ងៃខែឆ្នាំកំណើត",
    regJoinDate: "ថ្ងៃចូលធ្វើការ",
  },
  en: {
    appSubtitle: "Smart Digital Attendance Hub",
    morningGreeting: "Good morning",
    afternoonGreeting: "Good afternoon",
    eveningGreeting: "Good evening",
    scanSubtitle: "Scan the office QR code to record your work attendance",
    switchStaff: "Switch Profile",
    chooseProfileTitle: "Select your identity",
    chooseProfileDesc: "Choose once and the app will remember you on this phone",
    done: "Done",
    checkIn: "Check-In",
    checkOut: "Check-Out",
    tapToScan: "Tap to Scan QR",
    heroTitleIn: "Tap button to Check-In for work",
    heroTitleOut: "Tap button to Check-Out from work",
    heroDesc: "Verifies GPS location and broadcasts instant alert to Telegram",
    gpsWaiting: "Verifying GPS...",
    gpsAllow: "Please enable Location Permission",
    inOffice: "At Office Location ✅",
    outOffice: "Outside Office Perimeter 📍",
    todayAttendance: "My Attendance Today",
    notCheckedIn: "Not Checked-In",
    onDuty: "🟢 On Duty",
    checkedOut: "🔴 Checked-Out",
    checkInTime: "Check-In Time",
    checkOutTime: "Check-Out Time",
    waitingIn: "Awaiting Check-in",
    waitingOut: "Awaiting Check-out",
    workHours: "Working Hours",
    officialOffice: "Official Office",
    myRecentActivity: "My Recent Scans",
    last5times: "Last 5 entries",
    loadingData: "Loading records...",
    noDataYet: "No attendance records yet",
    guideTitle: "Quick Instructions",
    guideDesc: "Tap the central scan button and point camera at the office QR code poster. Real-time alert will be sent to Telegram group.",
    adminPortal: "Admin Portal",
    staffView: "Staff View",
    lock: "Exit / Lock",
    statTotal: "Total Members",
    statTotalSub: "Registered in system",
    statTodayIn: "Today Check-In",
    statTodayOut: "Today Check-Out",
    statAbsent: "Absent / Pending",
    statAbsentSub: "Not checked-in yet",
    shareWifiTitle: "📱 Wi-Fi Mobile Link for Employees",
    shareWifiDesc: "Staff can open this link on their mobile Safari/Chrome browser",
    copy: "Copy Link",
    recentLiveFeed: "Today's Live Attendance Feed",
    viewAll: "View All →",
    colMember: "Member",
    colAction: "Action",
    colTime: "Time",
    colLocation: "Geofence Status",
    posterTitle: "🖨️ Print Office QR Code Poster",
    posterDesc: "Print and place this QR poster at reception or entrance for staff scanning",
    posterScanText: "Open mobile phone and scan this QR code",
    printPoster: "Print QR Poster",
    addNewMember: "Add New Member",
    filterDate: "Date Filter:",
    exportExcel: "Export Excel/CSV",
    colName: "Name",
    colPhone: "Phone Number",
    colEmail: "Email Address",
    colCode: "Code",
    colRole: "Role",
    colDistance: "GPS Distance",
    colGeofence: "Geofence",
    enableTelegramAlert: "Enable instant Telegram alert on scans",
    save: "Save",
    testTelegram: "Test Alert",
    secTitle: "Location & Security",
    lblCompanyName: "Company / Organization Name",
    lblRadius: "Allowed Radius (meters)",
    saveSettings: "Save Settings",
    modalScanPrompt: "Scan Office QR",
    aimCamera: "Point camera directly at the office QR code",
    cancel: "Cancel",
    footerPowered: "Smart Attendance System powered by GPS Geofencing & Telegram Bot",
    alertSuccess: "Success!",
    alertFailed: "Scan Unsuccessful",
    alertGpsDenied: "GPS unavailable. Please enable location permissions.",
    alertCopied: "Link copied to clipboard!",
    pinPromptTitle: "🔒 Admin Access",
    pinPromptInput: "Enter Admin PIN (Default: 1234)",
    confirmBtn: "Confirm",
    loginPortalSubtitle: "Staff Login",
    tabSignIn: "Sign In",
    tabRegister: "Registration",
    lblPhoneOrCode: "Phone or Member ID",
    phoneOrCodePlaceholder: "Enter phone or member ID",
    lblSelectOrInput: "Select Your Name",
    orByCode: "Or Enter Member ID",
    lblPassword: "Password",
    passwordPlaceholder: "Enter your password",
    pwdNotice: "Use the password provided by Admin",
    btnSignIn: "Sign In",
    adminRegOnlyTitle: "New employee not on the list?",
    adminRegOnlyDesc: "Please contact Management / Admin to register and receive your login password.",
    addNewMember: "Register New Member",
    memberModalSubtitle: "Fill in employee details and assign login password",
    secLoginAccess: "Account & Login Access (Admin Assigned)",
    secPersonalInfo: "Personal Information (Profile)",
    secWorkInfo: "Employment & Contract Details",
    colPassword: "Login Password *",
    colGender: "Gender",
    colDob: "Date of Birth",
    colNationalId: "National ID / Passport",
    colEmergency: "Emergency Contact",
    colAddress: "Current Address",
    colJoinDate: "Start Date",
    colSalaryType: "Salary Type",
    colNotes: "Additional Notes",
    logout: "Log Out",
    slotMorningIn: "1. Morning In (08:00)",
    slotLunchOut: "2. Lunch Break (11:00)",
    slotAfternoonIn: "3. Return In (13:00)",
    slotEveningOut: "4. Evening Out (17:00)",
    slotTitleMorning: "Tap button to scan Morning Check-In (1/4)",
    slotTitleLunch: "Tap button to scan Lunch Break (2/4)",
    slotTitleAfternoon: "Tap button to scan Afternoon Return (3/4)",
    slotTitleEvening: "Tap button to scan Evening Check-Out (4/4)",
    scheduleBadge: "Mon - Sat",
    sundayOffBadge: "🏖️ Sunday Day Off (Work Break / OT)",
    scanProgress: "Scans:",
    allScansCompleted: "✨ All 4 scans done today!",
    slot1Title: "1. Morning In",
    slot2Title: "2. Lunch Break",
    slot3Title: "3. Return In",
    slot4Title: "4. Evening Out",
    nextScanLbl: "Next Scan:",
    waiting: "Pending",
    doneSlot: "Done",
    selfRegTitle: "No account yet?",
    selfRegDesc: "Create an account, then wait for Admin approval.",
    btnSelfRegister: "Create Account",
    pendingApprovalTitle: "Pending Staff Registrations (Awaiting Approval)",
    generalSettings: "General Settings",
    languageLabel: "Language",
    themesLabel: "UI Style & Colors",
    fontsLabel: "Khmer Fonts",
    themeModalTitle: "UI Style & Colors",
    themeModalDesc: "Choose your preferred interface style and color theme",
    uiStyleTitle: "UI Style",
    colorThemeTitle: "Color Theme",
    doneTheme: "Done",
    fontModalTitle: "Khmer Fonts",
    fontModalDesc: "Choose a clear Khmer font that suits you",
    recommended: "Recommended",
    requestLeave: "Leave or Late Request",
    myRequests: "My Request Status",
    myAttendance: "My Attendance Records",
    adminSystem: "Admin & System",
    adminPortalLabel: "Open Admin Portal",
    companyTelegram: "Company Telegram",
    teamOverviewTitle: "Team Overview",
    teamMembersLabel: "Total staff",
    teamPresentLabel: "Present today",
    rankingTitle: "Punctuality ranking",
    thisWeek: "Week",
    thisMonth: "Month",
    rankingRule: "Score = 1 per punctual slot + 2 per day with all 4 slots. Duplicate taps do not add points.",
    regNameKm: "Name in Khmer",
    regNameLatin: "Name in Latin letters",
    regDob: "Date of birth",
    regJoinDate: "Employment start date",
  }
};

// ================= LANGUAGE SWITCHER =================
function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('attendance_lang', lang);
  document.documentElement.lang = lang;

  // Update Buttons explicitly (Header)
  const btnKm = document.getElementById('langKmBtn');
  const btnEn = document.getElementById('langEnBtn');
  if (btnKm && btnEn) {
    btnKm.innerHTML = '<span class="text-xs">🇰🇭</span><span>ខ្មែរ</span>';
    btnEn.innerHTML = '<span class="text-xs">🇬🇧</span><span>EN</span>';

    if (lang === 'km') {
      btnKm.className = 'px-2 py-1 rounded-lg transition-all flex items-center gap-1 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-cyan-500/25 font-bold notranslate';
      btnEn.className = 'px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-slate-300 hover:text-white font-medium notranslate';
    } else {
      btnEn.className = 'px-2 py-1 rounded-lg transition-all flex items-center gap-1 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-cyan-500/25 font-bold notranslate';
      btnKm.className = 'px-2 py-1 rounded-lg transition-all flex items-center gap-1 text-slate-300 hover:text-white font-medium notranslate';
    }
  }

  // Update Admin Language Switcher Buttons
  const admKm = document.getElementById('admLangKmBtn');
  const admEn = document.getElementById('admLangEnBtn');
  if (admKm && admEn) {
    if (lang === 'km') {
      admKm.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-cyan-500/25 notranslate';
      admEn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-all flex items-center gap-1.5 notranslate';
    } else {
      admEn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-cyan-500/25 notranslate';
      admKm.className = 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-all flex items-center gap-1.5 notranslate';
    }
  }

  // Update Drawer Language Switcher Buttons
  const drKm = document.getElementById('drawerLangKmBtn');
  const drEn = document.getElementById('drawerLangEnBtn');
  if (drKm && drEn) {
    if (lang === 'km') {
      drKm.className = 'px-2 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-xs';
      drEn.className = 'px-2 py-1 rounded-md text-[11px] font-medium text-slate-400 hover:text-white transition flex items-center gap-1';
    } else {
      drEn.className = 'px-2 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-xs';
      drKm.className = 'px-2 py-1 rounded-md text-[11px] font-medium text-slate-400 hover:text-white transition flex items-center gap-1';
    }
  }

  // Update all DOM elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (translations[lang] && translations[lang][key]) {
      el.setAttribute('placeholder', translations[lang][key]);
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (translations[lang] && translations[lang][key]) {
      el.setAttribute('title', translations[lang][key]);
      el.setAttribute('aria-label', translations[lang][key]);
    }
  });

  // Dynamic greetings based on time
  updateGreeting();
  renderTeamRanking();

  // Refresh Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Re-render dynamic components
  if (currentStaff) {
    loadMyAttendanceActivity();
  }
  if (userCoords.lat && userCoords.lng) {
    updateStaffGpsUI(userCoords.lat, userCoords.lng);
  }
}

function updateGreeting() {
  const hour = new Date().getHours();
  const greetingEl = document.getElementById('greetingTimeText');
  if (!greetingEl) return;

  if (currentLang === 'km') {
    if (hour < 12) greetingEl.textContent = 'អរុណសួស្តី ☀️';
    else if (hour < 17) greetingEl.textContent = 'ទិវាសួស្តី 🌤️';
    else greetingEl.textContent = 'សាយណ្ហសួស្តី 🌙';
  } else {
    if (hour < 12) greetingEl.textContent = 'Good morning ☀️';
    else if (hour < 17) greetingEl.textContent = 'Good afternoon 🌤️';
    else greetingEl.textContent = 'Good evening 🌙';
  }
}

// ================= THEME ENGINE (LIQUID GLASS CHOICES) =================
const COLOR_THEMES = ['crystal', 'cyber', 'emerald', 'sunset', 'ocean', 'royal', 'graphite', 'sakura'];
const UI_STYLES = ['fluid', 'compact', 'minimal', 'soft'];
let currentTheme = localStorage.getItem('vst_theme') || 'crystal';
let currentUiStyle = localStorage.getItem('vst_ui_style') || 'fluid';

function applyTheme(themeId) {
  if (!COLOR_THEMES.includes(themeId)) {
    themeId = 'crystal';
  }
  currentTheme = themeId;
  document.body.setAttribute('data-theme', themeId);

  // Update theme option card active borders and check icons
  COLOR_THEMES.forEach(t => {
    const card = document.getElementById(`themeCard-${t}`);
    if (card) {
      const checkIcon = card.querySelector('.theme-check-icon');
      if (t === themeId) {
        card.classList.add('border-cyan-400', 'shadow-[0_0_20px_rgba(6,182,212,0.4)]');
        card.classList.remove('border-white/15');
        if (checkIcon) {
          checkIcon.classList.remove('text-transparent');
          checkIcon.classList.add('text-cyan-400');
        }
      } else {
        card.classList.remove('border-cyan-400', 'shadow-[0_0_20px_rgba(6,182,212,0.4)]');
        card.classList.add('border-white/15');
        if (checkIcon) {
          checkIcon.classList.add('text-transparent');
          checkIcon.classList.remove('text-cyan-400');
        }
      }
    }
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

function applyUiStyle(styleId) {
  if (!UI_STYLES.includes(styleId)) styleId = 'fluid';
  currentUiStyle = styleId;
  document.body.setAttribute('data-ui-style', styleId);
  UI_STYLES.forEach(style => {
    const card = document.getElementById(`uiStyleCard-${style}`);
    if (!card) return;
    const checkIcon = card.querySelector('.ui-style-check-icon');
    card.classList.toggle('border-cyan-400', style === styleId);
    card.classList.toggle('border-white/15', style !== styleId);
    if (checkIcon) {
      checkIcon.classList.toggle('text-cyan-400', style === styleId);
      checkIcon.classList.toggle('text-transparent', style !== styleId);
    }
  });
}

function selectUiStyle(styleId) {
  applyUiStyle(styleId);
  localStorage.setItem('vst_ui_style', styleId);
}

// ================= APP SLIDE-OVER DRAWER MENU =================
function openAppDrawerMenu() {
  const drawer = document.getElementById('appDrawerMenu');
  const backdrop = document.getElementById('appDrawerBackdrop');
  const panel = document.getElementById('appDrawerPanel');
  if (!drawer) return;

  // Sync Current Staff Profile in Drawer
  const pSec = document.getElementById('drawerProfileSection');
  const dName = document.getElementById('drawerStaffName');
  const dRole = document.getElementById('drawerStaffRole');
  const dCode = document.getElementById('drawerStaffCode');
  const dAvatarWrap = document.getElementById('drawerAvatarWrapper');
  const btnLogout = document.getElementById('btnDrawerLogout');

  if (currentStaff) {
    if (dName) dName.textContent = currentStaff.name || 'សមាជិក';
    if (dRole) dRole.textContent = currentStaff.role || 'បុគ្គលិក';
    if (dCode) dCode.textContent = currentStaff.code || 'MEM-000';
    if (dAvatarWrap) {
      if (currentStaff.avatar && currentStaff.avatar.trim()) {
        dAvatarWrap.innerHTML = `<img src="${currentStaff.avatar}" alt="${currentStaff.name}" class="w-full h-full object-cover rounded-full">`;
      } else {
        const initial = currentStaff.name ? currentStaff.name.trim().charAt(0) : 'U';
        dAvatarWrap.innerHTML = `<span class="font-bold text-white text-sm">${initial}</span>`;
      }
    }
    if (pSec) pSec.classList.remove('hidden');
    if (btnLogout) btnLogout.classList.remove('hidden');
  } else {
    if (pSec) pSec.classList.add('hidden');
    if (btnLogout) btnLogout.classList.add('hidden');
  }

  drawer.classList.remove('invisible', 'pointer-events-none');
  drawer.classList.add('pointer-events-auto', 'opacity-100');
  if (backdrop) {
    backdrop.classList.remove('opacity-0');
    backdrop.classList.add('opacity-100');
  }
  if (panel) {
    panel.classList.remove('translate-x-full');
    panel.classList.add('translate-x-0');
  }
  if (window.lucide) lucide.createIcons();
}

function closeAppDrawerMenu() {
  const drawer = document.getElementById('appDrawerMenu');
  const backdrop = document.getElementById('appDrawerBackdrop');
  const panel = document.getElementById('appDrawerPanel');
  if (!drawer) return;

  if (panel) {
    panel.classList.remove('translate-x-0');
    panel.classList.add('translate-x-full');
  }
  if (backdrop) {
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
  }
  setTimeout(() => {
    drawer.classList.remove('opacity-100', 'pointer-events-auto');
    drawer.classList.add('invisible', 'pointer-events-none');
  }, 280);
}

function openThemeSelectorModal() {
  applyTheme(currentTheme);
  applyUiStyle(currentUiStyle);
  const modal = document.getElementById('themeSelectorModal');
  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function closeThemeSelectorModal() {
  const modal = document.getElementById('themeSelectorModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function selectTheme(themeId) {
  applyTheme(themeId);
  localStorage.setItem('vst_theme', themeId);
}

// ================= KHMER FONT MANAGEMENT =================
const KHMER_FONTS = ['kantumruy', 'noto', 'battambang', 'siemreap', 'koulen'];
let currentKhmerFont = localStorage.getItem('vst_font_choice') || 'kantumruy';

function applyKhmerFont(fontKey) {
  if (!KHMER_FONTS.includes(fontKey)) fontKey = 'kantumruy';
  currentKhmerFont = fontKey;

  // Remove previous font classes from body
  KHMER_FONTS.forEach(f => {
    document.body.classList.remove('font-' + f);
  });

  // Add the chosen font class
  document.body.classList.add('font-' + fontKey);

  // Update card borders and checkmarks in modal
  KHMER_FONTS.forEach(f => {
    const card = document.getElementById('fontCard-' + f);
    if (!card) return;
    const checkIcon = card.querySelector('.font-check-icon');
    if (f === fontKey) {
      card.classList.remove('border-white/10');
      card.classList.add('border-cyan-400/60', 'bg-white/10');
      if (checkIcon) {
        checkIcon.classList.remove('text-transparent');
        checkIcon.classList.add('text-cyan-400');
      }
    } else {
      card.classList.remove('border-cyan-400/60', 'bg-white/10');
      card.classList.add('border-white/10');
      if (checkIcon) {
        checkIcon.classList.remove('text-cyan-400');
        checkIcon.classList.add('text-transparent');
      }
    }
  });

  localStorage.setItem('vst_font_choice', fontKey);
}

function selectKhmerFont(fontKey) {
  applyKhmerFont(fontKey);
}

function openFontSelectorModal() {
  applyKhmerFont(currentKhmerFont);
  const modal = document.getElementById('fontSelectorModal');
  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function closeFontSelectorModal() {
  const modal = document.getElementById('fontSelectorModal');
  if (modal) modal.classList.add('hidden');
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(currentTheme);
  applyUiStyle(currentUiStyle);
  applyKhmerFont(currentKhmerFont);
  setLanguage(currentLang);
  initLiveClock();

  // 1. Restore saved login session synchronously to prevent login screen flashing
  initStaffProfile();
  initStaffGPS();
  fetchNetworkStatus();
  setInterval(fetchNetworkStatus, 30000);

  const ipDisplay = document.getElementById('localNetworkUrlDisplay');
  if (ipDisplay) ipDisplay.textContent = mobileAppUrl;
  const posterUrl = document.getElementById('posterUrlDisplay');
  if (posterUrl) posterUrl.textContent = mobileAppUrl;

  // 2. Fetch public info and update dropdowns
  try {
    await loadPublicInfo();
    if (!currentStaff) {
      initStaffProfile();
    }
  } catch (err) {
    console.error('Error loading public info:', err);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  }
});

let staffDashboardRefreshInFlight = false;
async function refreshStaffDashboard(button) {
  if (staffDashboardRefreshInFlight) return;
  staffDashboardRefreshInFlight = true;
  const refreshButton = button || document.getElementById('staffDashboardRefreshBtn');
  if (refreshButton) {
    refreshButton.classList.add('is-refreshing');
    refreshButton.disabled = true;
  }

  try {
    await Promise.allSettled([
      loadMyAttendanceActivity(),
      loadTeamOverview(),
      fetchNetworkStatus(false),
      currentStaff ? loadMyAttendanceHistory() : Promise.resolve()
    ]);
    if (window.lucide) lucide.createIcons();
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'ទិន្នន័យថ្មីបំផុតត្រូវបាន Refresh រួចរាល់',
      showConfirmButton: false,
      timer: 1700
    });
  } finally {
    if (refreshButton) {
      refreshButton.classList.remove('is-refreshing');
      refreshButton.disabled = false;
    }
    staffDashboardRefreshInFlight = false;
  }
}

// 1. Live Digital Clock
function initLiveClock() {
  function updateTime() {
    const now = new Date();
    const loc = currentLang === 'km' ? 'km-KH' : 'en-US';
    const timeStr = now.toLocaleTimeString(loc, { hour12: false });
    const dateStr = now.toLocaleDateString(loc, { 
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
    });

    const clockEl = document.getElementById('liveClock');
    const dateEl = document.getElementById('liveDate');
    if (clockEl) clockEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;

    const mobClock = document.getElementById('mobileLiveClock');
    const mobDate = document.getElementById('mobileLiveDate');
    if (mobClock) mobClock.textContent = timeStr;
    if (mobDate) mobDate.textContent = now.toLocaleDateString(loc, { month: 'short', day: 'numeric' });
  }
  updateTime();
  setInterval(updateTime, 1000);
}

// 2. Load Public Information & Configurations
async function loadPublicInfo() {
  try {
    const res = await fetch('/api/public-info');
    publicInfo = await res.json();
    
    // Update company branding across header & poster
    const compEl = document.getElementById('headerCompanyName');
    if (compEl) compEl.textContent = publicInfo.companyName;
    const postCompEl = document.getElementById('posterCompanyName');
    if (postCompEl) postCompEl.textContent = publicInfo.companyName;

    const radText = document.getElementById('officeAllowedRadiusText');
    if (radText) {
      radText.textContent = currentLang === 'km' ? `រង្វង់ ${publicInfo.allowedRadius} ម៉ែត្រ` : `${publicInfo.allowedRadius} meters`;
    }

    // Populate staff selects
    const selectEl = document.getElementById('selectInitialStaff');
    const loginSelect = document.getElementById('loginSelectStaff');
    const optionsHtml = '<option value="">-- ' + (currentLang === 'km' ? 'ជ្រើសរើសឈ្មោះរបស់អ្នក' : 'Select your name') + ' --</option>' +
      publicInfo.members.map(m => `<option value="${m.code}">${m.name} (${m.code}) - ${m.role || ''}</option>`).join('');

    if (selectEl) selectEl.innerHTML = optionsHtml;
    if (loginSelect) loginSelect.innerHTML = optionsHtml;

    const admHistoryMemEl = document.getElementById('adminHistoryMemberFilter');
    if (admHistoryMemEl) {
      const prevVal = admHistoryMemEl.value;
      admHistoryMemEl.innerHTML = '<option value="">-- ' + (currentLang === 'km' ? 'បុគ្គលិកទាំងអស់ (All Members)' : 'All Members') + ' --</option>' +
        publicInfo.members.map(m => `<option value="${m.code}">${m.name} (${m.code}) - ${m.role || ''}</option>`).join('');
      if (prevVal) admHistoryMemEl.value = prevVal;
    }
  } catch (err) {
    console.error('Failed to load public info:', err);
  }
}

// 3. Staff Profile & LocalStorage/Cookie Persistence (Never bounce to login on refresh)
function saveStaffToStorage(member) {
  try {
    localStorage.setItem('my_attendance_member_code', member.code);
    localStorage.setItem('my_attendance_member_data', JSON.stringify(member));
    document.cookie = `vst_staff=${encodeURIComponent(JSON.stringify({ code: member.code, name: member.name, role: member.role, avatar: member.avatar || '' }))}; path=/; max-age=31536000; SameSite=Lax`;
  } catch (e) {
    console.warn('Storage save error:', e);
  }
}

function getSavedStaffFromStorage() {
  try {
    const data = localStorage.getItem('my_attendance_member_data');
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed && (parsed.code || parsed.name)) return parsed;
    }
  } catch (e) {}

  try {
    const match = document.cookie.match(/(?:^|; )vst_staff=([^;]*)/);
    if (match && match[1]) {
      const parsed = JSON.parse(decodeURIComponent(match[1]));
      if (parsed && (parsed.code || parsed.name)) return parsed;
    }
  } catch (e) {}

  return null;
}

function initStaffProfile() {
  const saved = getSavedStaffFromStorage();
  if (saved && (saved.code || saved.id || saved.name)) {
    setStaffProfile(saved);
    showStaffView();
    return true;
  }

  const savedCode = localStorage.getItem('my_attendance_member_code');
  if (savedCode && publicInfo && publicInfo.members && publicInfo.members.length > 0) {
    const found = publicInfo.members.find(m => m.code && m.code.toUpperCase() === savedCode.toUpperCase());
    if (found) {
      setStaffProfile(found);
      showStaffView();
      return true;
    }
  }

  // Strict session check: if not logged in, stay on loginView (do NOT auto-login to staff view)
  currentStaff = null;
  showLoginView();
  return false;
}

function getKhCurrentDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 7));
}

function getKhDateString(d = getKhCurrentDate()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getKhMonthString(d = getKhCurrentDate()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getKhWeekRange(d = getKhCurrentDate()) {
  const curr = new Date(d);
  const day = curr.getDay(); // 0: Sun, 1: Mon, ... 6: Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  
  const monday = new Date(curr);
  monday.setDate(curr.getDate() + diffToMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  return {
    startDate: getKhDateString(monday),
    endDate: getKhDateString(sunday),
    monday,
    sunday
  };
}

function toggleBottomNav(visible) {
  const bNav = document.getElementById('acledaBottomNav');
  const bWrap = document.getElementById('acledaBottomNavWrapper');
  if (visible) {
    if (bNav) bNav.classList.remove('hidden');
    if (bWrap) bWrap.classList.remove('hidden');
  } else {
    if (bNav) bNav.classList.add('hidden');
    if (bWrap) bWrap.classList.add('hidden');
  }
}

function applyViewMotion(el) {
  if (!el) return;
  el.classList.remove('view-enter-motion');
  void el.offsetWidth;
  el.classList.add('view-enter-motion');
}

function showLoginView() {
  const loginV = document.getElementById('loginView');
  const staffV = document.getElementById('staffView');
  const staffHistV = document.getElementById('staffHistoryView');
  const adminV = document.getElementById('adminView');
  if (loginV) {
    loginV.classList.remove('hidden');
    applyViewMotion(loginV);
  }
  if (staffV) staffV.classList.add('hidden');
  if (staffHistV) staffHistV.classList.add('hidden');
  if (adminV) adminV.classList.add('hidden');
  const btnStaff = document.getElementById('btnSwitchToStaff');
  const btnAdmin = document.getElementById('btnSwitchToAdmin');
  const btnLogout = document.getElementById('btnStaffLogoutTop');
  if (btnStaff) btnStaff.classList.add('hidden');
  if (btnAdmin) btnAdmin.classList.remove('hidden');
  if (btnLogout) btnLogout.classList.add('hidden');

  toggleBottomNav(false);
}

function showStaffView() {
  const loginV = document.getElementById('loginView');
  const staffV = document.getElementById('staffView');
  const staffHistV = document.getElementById('staffHistoryView');
  const adminV = document.getElementById('adminView');
  if (loginV) loginV.classList.add('hidden');
  if (staffV) {
    staffV.classList.remove('hidden');
    applyViewMotion(staffV);
  }
  if (staffHistV) staffHistV.classList.add('hidden');
  if (adminV) adminV.classList.add('hidden');
  const btnStaff = document.getElementById('btnSwitchToStaff');
  const btnAdmin = document.getElementById('btnSwitchToAdmin');
  const btnLogout = document.getElementById('btnStaffLogoutTop');
  if (btnStaff) btnStaff.classList.add('hidden');
  if (btnAdmin) btnAdmin.classList.remove('hidden');
  if (btnLogout) btnLogout.classList.remove('hidden');

  // Bottom dock active styles: Home active, History inactive
  const iconHome = document.getElementById('iconBottomNavHome');
  const textHome = document.getElementById('textBottomNavHome');
  const iconHist = document.getElementById('iconBottomNavHistory');
  const textHist = document.getElementById('textBottomNavHistory');

  if (iconHome && textHome) {
    iconHome.className = 'w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white group-hover:scale-110 transition-transform';
    textHome.className = 'text-[10px] font-bold mt-1 text-white';
  }
  if (iconHist && textHist) {
    iconHist.className = 'w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-white group-hover:scale-110 transition-transform';
    textHist.className = 'text-[10px] font-medium mt-1 text-slate-400';
  }

  toggleBottomNav(true);
  
  if (currentStaff) {
    loadMyAttendanceActivity();
    loadTeamOverview();
  }
}

let teamOverview = null;
let teamRankingPeriod = 'week';

function setTeamRankingPeriod(period) {
  if (period !== 'week' && period !== 'month') return;
  teamRankingPeriod = period;
  renderTeamRanking();
}

function renderTeamRanking() {
  const container = document.getElementById('staffTeamRanking');
  if (!container) return;
  for (const period of ['week', 'month']) {
    const button = document.getElementById(period === 'week' ? 'rankingWeekBtn' : 'rankingMonthBtn');
    if (!button) continue;
    button.classList.toggle('bg-cyan-500', period === teamRankingPeriod);
    button.classList.toggle('text-slate-950', period === teamRankingPeriod);
    button.classList.toggle('text-slate-300', period !== teamRankingPeriod);
    button.setAttribute('aria-pressed', String(period === teamRankingPeriod));
  }
  if (!teamOverview) return;
  const members = document.getElementById('staffTeamMembers');
  const present = document.getElementById('staffTeamPresent');
  if (members) members.textContent = teamOverview.totalMembers ?? 0;
  if (present) present.textContent = teamOverview.todayPresent ?? 0;
  const leaders = teamOverview[teamRankingPeriod]?.leaders || [];
  if (!leaders.length) {
    container.textContent = currentLang === 'km' ? 'មិនទាន់មានទិន្នន័យវត្តមានក្នុងរយៈពេលនេះ' : 'No attendance records for this period yet';
    return;
  }
  container.innerHTML = leaders.map((leader, index) => `
    <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10">
      <div class="min-w-0 flex items-center gap-2">
        <span class="w-7 h-7 rounded-lg bg-cyan-500/15 text-cyan-300 flex items-center justify-center font-black flex-shrink-0">${index + 1}</span>
        <div class="min-w-0">
          <div class="font-bold text-white truncate">${escapeHtml(leader.name)}${leader.nameLatin ? ` <span class="text-slate-400 font-normal">(${escapeHtml(leader.nameLatin)})</span>` : ''}</div>
          <div class="text-[10px] text-slate-400">${currentLang === 'km' ? `វត្តមាន ${leader.daysPresent} ថ្ងៃ · ពេញ ៤ វេន ${leader.completedDays} ថ្ងៃ` : `${leader.daysPresent} days present · ${leader.completedDays} complete days`}</div>
        </div>
      </div>
      <span class="text-cyan-300 font-bold font-mono flex-shrink-0">${leader.score} ${currentLang === 'km' ? 'ពិន្ទុ' : 'pts'}</span>
    </div>
  `).join('');
}

async function loadTeamOverview() {
  const container = document.getElementById('staffTeamRanking');
  if (!container || !currentStaff) return;
  try {
    const response = await fetch('/api/staff/team-overview');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    teamOverview = await response.json();
    renderTeamRanking();
  } catch (err) {
    console.warn('Team overview unavailable:', err);
    container.textContent = currentLang === 'km' ? 'មិនអាចទាញយកស្ថិតិក្រុមបានទេ' : 'Team overview is unavailable';
  }
}

let staffHistoryCurrentPeriod = 'week';

function showStaffHistoryView() {
  const loginV = document.getElementById('loginView');
  const staffV = document.getElementById('staffView');
  const staffHistV = document.getElementById('staffHistoryView');
  const adminV = document.getElementById('adminView');

  if (loginV) loginV.classList.add('hidden');
  if (staffV) staffV.classList.add('hidden');
  if (staffHistV) {
    staffHistV.classList.remove('hidden');
    applyViewMotion(staffHistV);
  }
  if (adminV) adminV.classList.add('hidden');

  // Bottom dock active styles: History active, Home inactive
  const iconHome = document.getElementById('iconBottomNavHome');
  const textHome = document.getElementById('textBottomNavHome');
  const iconHist = document.getElementById('iconBottomNavHistory');
  const textHist = document.getElementById('textBottomNavHistory');

  if (iconHome && textHome) {
    iconHome.className = 'w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-white group-hover:scale-110 transition-transform';
    textHome.className = 'text-[10px] font-medium mt-1 text-slate-400';
  }
  if (iconHist && textHist) {
    iconHist.className = 'w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white group-hover:scale-110 transition-transform';
    textHist.className = 'text-[10px] font-bold mt-1 text-white';
  }

  toggleBottomNav(true);

  if (currentStaff) {
    const nameEl = document.getElementById('staffHistoryEmployeeName');
    if (nameEl) nameEl.textContent = `${currentStaff.name} (${currentStaff.code}) • ${currentStaff.role || ''}`;
    loadMyAttendanceHistory(staffHistoryCurrentPeriod);
  } else {
    showLoginView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setStaffHistoryPeriod(period) {
  staffHistoryCurrentPeriod = period;
  const btns = {
    week: document.getElementById('btnStaffPeriodWeek'),
    month: document.getElementById('btnStaffPeriodMonth'),
    all: document.getElementById('btnStaffPeriodAll')
  };

  Object.keys(btns).forEach(key => {
    const btn = btns[key];
    if (!btn) return;
    if (key === period) {
      btn.className = 'staff-period-btn flex-1 py-2 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20 cursor-pointer';
    } else {
      btn.className = 'staff-period-btn flex-1 py-2 px-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition flex items-center justify-center gap-1.5 cursor-pointer';
    }
  });

  loadMyAttendanceHistory(period);
}

async function loadMyAttendanceHistory(period = staffHistoryCurrentPeriod) {
  if (!currentStaff) return;
  const listContainer = document.getElementById('staffHistoryListContainer');
  const periodTextEl = document.getElementById('staffHistoryPeriodText');
  const countEl = document.getElementById('staffHistoryRecordCount');
  const kpiTotalEl = document.getElementById('staffKpiTotalScans');
  const kpiWorkDaysEl = document.getElementById('staffKpiWorkDays');
  const kpiGeofenceEl = document.getElementById('staffKpiGeofencePct');

  let queryUrl = `/api/attendance?code=${encodeURIComponent(currentStaff.code)}&limit=500`;

  if (period === 'week') {
    const { startDate, endDate, monday, sunday } = getKhWeekRange();
    queryUrl += `&startDate=${startDate}&endDate=${endDate}`;
    if (periodTextEl) {
      const monStr = monday.toLocaleDateString(currentLang === 'km' ? 'km-KH' : 'en-US', { timeZone: 'Asia/Phnom_Penh', day: 'numeric', month: 'short' });
      const sunStr = sunday.toLocaleDateString(currentLang === 'km' ? 'km-KH' : 'en-US', { timeZone: 'Asia/Phnom_Penh', day: 'numeric', month: 'short' });
      periodTextEl.textContent = currentLang === 'km' ? `សប្តាហ៍នេះ (${monStr} - ${sunStr})` : `This Week (${monStr} - ${sunStr})`;
    }
  } else if (period === 'month') {
    const curMonth = getKhMonthString();
    queryUrl += `&month=${curMonth}`;
    if (periodTextEl) {
      const d = getKhCurrentDate();
      const monthStr = d.toLocaleDateString(currentLang === 'km' ? 'km-KH' : 'en-US', { timeZone: 'Asia/Phnom_Penh', month: 'long', year: 'numeric' });
      periodTextEl.textContent = currentLang === 'km' ? `ខែនេះ (${monthStr})` : `This Month (${monthStr})`;
    }
  } else {
    if (periodTextEl) {
      periodTextEl.textContent = currentLang === 'km' ? 'កំណត់ត្រាទាំងអស់ (All Time)' : 'All Records';
    }
  }

  try {
    if (listContainer) listContainer.innerHTML = '<div class="py-12 text-center text-xs text-slate-400">កំពុងទាញយកកំណត់ត្រា...</div>';
    const res = await fetch(queryUrl);
    if (!res.ok) throw new Error('Failed to load history');
    const logs = await res.json();

    if (countEl) countEl.textContent = `${logs.length} កំណត់ត្រា`;

    // Calculate KPIs
    const totalScans = logs.length;
    const distinctDates = new Set();
    let insideGeofenceCount = 0;

    logs.forEach(l => {
      const datePart = l.timestamp ? l.timestamp.slice(0, 10) : '';
      if (datePart) distinctDates.add(datePart);
      if (l.is_within_range) insideGeofenceCount++;
    });

    const geofencePct = totalScans > 0 ? Math.round((insideGeofenceCount / totalScans) * 100) : 100;

    if (kpiTotalEl) kpiTotalEl.textContent = totalScans;
    if (kpiWorkDaysEl) kpiWorkDaysEl.textContent = distinctDates.size;
    if (kpiGeofenceEl) kpiGeofenceEl.textContent = `${geofencePct}%`;

    if (!logs || logs.length === 0) {
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="glass-crystal p-8 rounded-3xl border border-white/10 text-center space-y-2 bg-slate-900/60">
            <div class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
              <i data-lucide="clipboard-x" class="w-6 h-6"></i>
            </div>
            <h4 class="font-bold text-sm text-slate-300">មិនទាន់មានកំណត់ត្រា</h4>
            <p class="text-xs text-slate-400 max-w-xs mx-auto">មិនមានទិន្នន័យចុះវត្តមានក្នុងកាលវេលាដែលបានជ្រើសរើសនេះទេ។</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
      }
      return;
    }

    // Group logs by Date
    const grouped = {};
    logs.forEach(l => {
      const d = new Date(l.timestamp);
      const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' }); // YYYY-MM-DD
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(l);
    });

    const slotLabels = {
      morning_in: { text: '1/4 ព្រឹកចូល (08:00)', enText: '1/4 Morning In', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      lunch_out: { text: '2/4 សម្រាកបាយ (11:00)', enText: '2/4 Lunch Break', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      afternoon_in: { text: '3/4 ចូលវិញ (13:00)', enText: '3/4 Return In', badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
      evening_out: { text: '4/4 ល្ងាចចេញ (17:00)', enText: '4/4 Evening Out', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
      check_in: { text: 'Check-In', enText: 'Check-In', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      check_out: { text: 'Check-Out', enText: 'Check-Out', badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20' }
    };

    const loc = currentLang === 'km' ? 'km-KH' : 'en-US';

    let html = '';
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach(dateStr => {
      const dateLogs = grouped[dateStr].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const sampleDate = new Date(dateLogs[0].timestamp);
      const formattedHeader = sampleDate.toLocaleDateString(loc, { 
        timeZone: 'Asia/Phnom_Penh', 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      });

      html += `
        <div class="glass-crystal rounded-3xl border border-white/10 bg-slate-900/60 overflow-hidden shadow-sm">
          <!-- Date Header -->
          <div class="p-3.5 bg-white/[0.03] border-b border-white/10 flex items-center justify-between">
            <span class="text-xs font-bold text-white flex items-center gap-2">
              <i data-lucide="calendar" class="w-3.5 h-3.5 text-cyan-400"></i>
              <span>${formattedHeader}</span>
            </span>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-mono font-bold">
              ${dateLogs.length}/4 ស្កេន
            </span>
          </div>

          <!-- Day Logs List -->
          <div class="divide-y divide-white/5 p-2 space-y-1">
            ${dateLogs.map(l => {
              const meta = slotLabels[l.type] || { text: l.type, enText: l.type, badge: 'bg-slate-800 text-slate-300 border-slate-700' };
              const label = currentLang === 'km' ? meta.text : meta.enText;
              const timeFormatted = new Date(l.timestamp).toLocaleTimeString(loc, {
                timeZone: 'Asia/Phnom_Penh',
                hour: '2-digit', minute: '2-digit', hour12: true
              });
              const distStr = l.distance_meters !== null ? `${l.distance_meters}m` : '';

              return `
                <div class="p-2.5 rounded-2xl hover:bg-white/[0.02] flex items-center justify-between gap-3 transition">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="px-2 py-1 rounded-xl text-[10px] font-bold border ${meta.badge} whitespace-nowrap">
                      ${label}
                    </span>
                    ${l.note ? `<span class="text-[10px] text-slate-400 italic truncate" title="${l.note}">"${l.note}"</span>` : ''}
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <div class="text-right">
                      <div class="font-mono text-xs font-bold text-white">${timeFormatted}</div>
                      ${distStr ? `<div class="text-[10px] font-mono ${l.is_within_range ? 'text-emerald-400' : 'text-rose-400'}">${distStr} (${l.is_within_range ? 'ក្នុង HQ' : 'ក្រៅ HQ'})</div>` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    if (listContainer) listContainer.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    if (listContainer) {
      listContainer.innerHTML = `<div class="py-8 text-center text-xs text-rose-400">មិនអាចទាញយកទិន្នន័យបានទេ: ${err.message}</div>`;
    }
  }
}

function onLoginSelectStaffChange() {
  const sel = document.getElementById('loginSelectStaff');
  const codeInput = document.getElementById('loginInputCode');
  const pwdInput = document.getElementById('loginInputPassword');
  if (sel && sel.value) {
    if (codeInput) codeInput.value = sel.value;
    if (pwdInput) pwdInput.focus();
  }
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    }
  } else {
    input.type = 'password';
    if (icon) {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }
}

async function handleEmployeeLogin(e) {
  e.preventDefault();
  const selectVal = document.getElementById('loginSelectStaff') ? document.getElementById('loginSelectStaff').value : '';
  const inputVal = document.getElementById('loginInputCode') ? document.getElementById('loginInputCode').value.trim() : '';
  const password = document.getElementById('loginInputPassword') ? document.getElementById('loginInputPassword').value.trim() : '';
  const codeOrPhone = inputVal || selectVal;

  if (!codeOrPhone) {
    Swal.fire({
      icon: 'info',
      title: currentLang === 'km' ? 'សូមបញ្ចូលលេខទូរស័ព្ទ ឬកូដ ID' : 'Phone Number or ID Required',
      text: currentLang === 'km' ? 'សូមបញ្ចូលលេខទូរស័ព្ទរបស់អ្នក ឬលេខកូដសម្គាល់ ID ដើម្បី Login' : 'Please enter your phone number or Member ID'
    });
    return;
  }

  if (!password) {
    Swal.fire({
      icon: 'warning',
      title: currentLang === 'km' ? 'សូមបញ្ចូល Password' : 'Password Required',
      text: currentLang === 'km' ? 'សូមបញ្ចូលលេខកូដសម្ងាត់ Password របស់អ្នក!' : 'Please enter your password'
    });
    return;
  }

  try {
    const res = await fetch('/api/members/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeOrPhone, password, device_id: getOrCreateDeviceId() })
    });
    let data = {};
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (e) {
        data = { error: 'ទម្រង់ឆ្លើយតបមិនត្រឹមត្រូវ' };
      }
    } else {
      const rawText = await res.text().catch(() => '');
      data = { error: rawText.includes('<') ? `Server Error (${res.status})` : rawText };
    }

    if (!res.ok) {
      Swal.fire({ 
        icon: 'error', 
        title: currentLang === 'km' ? 'ចូលមិនជោគជ័យ' : 'Login Failed', 
        text: data.error || (currentLang === 'km' ? 'សូមពិនិត្យមើលលេខកូដសម្ងាត់' : 'Invalid login credentials'),
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    setStaffProfile(data.member);
    showStaffView();
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: (currentLang === 'km' ? 'សូមស្វាគមន៍ ' : 'Welcome ') + data.member.name,
      showConfirmButton: false,
      timer: 2000
    });
  } catch (err) {
    Swal.fire({ 
      icon: 'error', 
      title: currentLang === 'km' ? 'បញ្ហាប្រព័ន្ធ' : 'Network Error', 
      text: err.message || (currentLang === 'km' ? 'មិនអាចទាក់ទងម៉ាស៊ីនបម្រើបានទេ' : 'Cannot reach server'),
      confirmButtonColor: '#f59e0b'
    });
  }
}

async function logoutStaffAccount() {
  const result = await Swal.fire({
    title: currentLang === 'km' ? 'ចាកចេញពីគណនី?' : 'Log Out?',
    text: currentLang === 'km' ? 'តើអ្នកចង់ចាកចេញពីគណនីនេះមែនទេ? អ្នកនឹងត្រឡប់ទៅផ្ទាំង Login វិញ។' : 'Are you sure you want to log out from this account?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: currentLang === 'km' ? 'ចាកចេញ (Log Out)' : 'Log Out',
    cancelButtonText: currentLang === 'km' ? 'បោះបង់' : 'Cancel',
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b'
  });

  if (!result.isConfirmed) return;

  // Clear saved staff session
  localStorage.removeItem('my_attendance_member_code');
  localStorage.removeItem('my_attendance_member_data');
  document.cookie = 'vst_staff=; path=/; max-age=0; SameSite=Lax';
  currentStaff = null;

  // Close profile modal if open
  closeStaffProfileModal();

  // Return to Login View
  showLoginView();

  Swal.fire({
    icon: 'success',
    title: currentLang === 'km' ? 'បានចាកចេញជោគជ័យ' : 'Logged Out',
    timer: 1500,
    showConfirmButton: false
  });
}

const logoutStaffProfile = logoutStaffAccount;

function setStaffProfile(member) {
  if (!member) return;
  // Restore locally cached custom avatar if available on this device
  try {
    const cachedAvatar = localStorage.getItem('vst_staff_avatar_' + member.code);
    if (cachedAvatar && cachedAvatar.startsWith('data:image/')) {
      member.avatar = cachedAvatar;
    }
  } catch (e) {}

  currentStaff = member;
  saveStaffToStorage(member);

  const nameEl = document.getElementById('staffDisplayName');
  if (nameEl) nameEl.textContent = member.name;
  const codeEl = document.getElementById('staffDisplayCode');
  if (codeEl) codeEl.textContent = member.code;
  const roleEl = document.getElementById('staffDisplayRole');
  if (roleEl) roleEl.textContent = member.role || (currentLang === 'km' ? 'សមាជិក' : 'Member');
  
  const wrapper = document.getElementById('staffAvatarWrapper');
  if (wrapper) {
    if (member.avatar && member.avatar.trim()) {
      wrapper.innerHTML = `<img src="${member.avatar}" alt="${member.name}" class="w-full h-full object-cover rounded-full block">`;
    } else {
      const initial = member.name ? member.name.trim().charAt(0).toUpperCase() : 'U';
      wrapper.innerHTML = `<span id="staffAvatar" class="font-extrabold text-lg text-white">${initial}</span>`;
    }
  }

  // Update Drawer menu profile
  const drawerName = document.getElementById('drawerStaffName');
  const drawerCode = document.getElementById('drawerStaffCode');
  const drawerRole = document.getElementById('drawerStaffRole');
  const drawerAvatar = document.getElementById('drawerAvatarWrapper');
  if (drawerName) drawerName.textContent = member.name;
  if (drawerCode) drawerCode.textContent = member.code;
  if (drawerRole) drawerRole.textContent = member.role || (currentLang === 'km' ? 'បុគ្គលិក' : 'Staff');
  if (drawerAvatar) {
    if (member.avatar && member.avatar.trim()) {
      drawerAvatar.innerHTML = `<img src="${member.avatar}" alt="${member.name}" class="w-full h-full object-cover rounded-full block">`;
    } else {
      const initial = member.name ? member.name.trim().charAt(0).toUpperCase() : 'U';
      drawerAvatar.innerHTML = `<span id="drawerAvatarText">${initial}</span>`;
    }
  }

  updateGreeting();
  
  const greetEl = document.getElementById('greetingStaffName');
  if (greetEl) greetEl.textContent = member.name;

  loadMyAttendanceActivity();
}

async function promptChangeStaffProfile() {
  if (!publicInfo || !publicInfo.members) return;

  const optionsHtml = publicInfo.members.map(m => `
    <option value="${m.code}" ${currentStaff && currentStaff.code === m.code ? 'selected' : ''}>
      ${m.name} (${m.code}) - ${m.role || ''}
    </option>
  `).join('');

  const { value: selectedCode } = await Swal.fire({
    title: currentLang === 'km' ? 'ប្តូរសមាជិក' : 'Switch Member Profile',
    html: `
      <p class="text-xs text-slate-500 mb-3">${currentLang === 'km' ? 'ជ្រើសរើសឈ្មោះរបស់អ្នកដើម្បីកត់ត្រាវត្តមាន៖' : 'Select your name to record attendance:'}</p>
      <select id="swalChangeStaff" class="w-full text-xs font-semibold p-3 border border-slate-200 rounded-xl bg-slate-50 focus:ring-2 focus:ring-amber-500">
        ${optionsHtml}
      </select>
    `,
    preConfirm: () => document.getElementById('swalChangeStaff').value,
    showCancelButton: true,
    confirmButtonText: currentLang === 'km' ? 'យល់ព្រមប្តូរ' : 'Confirm',
    cancelButtonText: currentLang === 'km' ? 'បោះបង់' : 'Cancel',
    confirmButtonColor: '#f59e0b'
  });

  if (selectedCode) {
    const found = publicInfo.members.find(m => m.code === selectedCode);
    if (found) {
      setStaffProfile(found);
    }
  }
}

// ================= STAFF SELF PROFILE & AVATAR MANAGEMENT =================
let pendingSelfAvatarData = null;

function openStaffProfileModal() {
  if (!currentStaff) {
    promptChangeStaffProfile();
    return;
  }
  
  const modal = document.getElementById('staffProfileModal');
  if (!modal) return;
  
  const nameEl = document.getElementById('staffModalDisplayName');
  const codeEl = document.getElementById('staffModalDisplayCode');
  const roleEl = document.getElementById('staffModalDisplayRole');
  const preview = document.getElementById('staffSelfAvatarPreview');
  
  if (nameEl) nameEl.textContent = currentStaff.name || '--';
  if (codeEl) codeEl.textContent = currentStaff.code || '--';
  if (roleEl) roleEl.textContent = currentStaff.role || (currentLang === 'km' ? 'សមាជិក' : 'Member');
  
  pendingSelfAvatarData = null;
  
  if (preview) {
    if (currentStaff.avatar && currentStaff.avatar.trim()) {
      preview.innerHTML = `<img src="${currentStaff.avatar}" class="w-full h-full object-cover">`;
    } else {
      const initial = currentStaff.name ? currentStaff.name.trim().charAt(0) : 'U';
      preview.innerHTML = `<span id="staffSelfAvatarFallback" class="font-extrabold text-white text-3xl">${initial}</span>`;
    }
  }
  
  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeStaffProfileModal() {
  const modal = document.getElementById('staffProfileModal');
  if (modal) modal.classList.add('hidden');
  pendingSelfAvatarData = null;
  const input = document.getElementById('staffSelfAvatarInput');
  if (input) input.value = '';
}

function handleStaffSelfAvatarSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    Swal.fire({
      icon: 'warning',
      title: currentLang === 'km' ? 'សូមជ្រើសរើសរូបភាព' : 'Invalid Image',
      text: currentLang === 'km' ? 'សូមជ្រើសរើសឯកសាររូបភាព (JPG, PNG, WEBP)' : 'Please select an image file.'
    });
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const maxDim = 400;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      pendingSelfAvatarData = compressedDataUrl;

      const preview = document.getElementById('staffSelfAvatarPreview');
      if (preview) {
        preview.innerHTML = `<img src="${compressedDataUrl}" class="w-full h-full object-cover animate-entrance">`;
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveStaffSelfAvatar() {
  if (!currentStaff) return;
  if (!pendingSelfAvatarData) {
    Swal.fire({
      icon: 'info',
      title: currentLang === 'km' ? 'មិនមានការផ្លាស់ប្តូរ' : 'No Changes',
      text: currentLang === 'km' ? 'សូមជ្រើសរើសរូបភាពថ្មីមុនពេលចុចរក្សាទុក' : 'Please select a new photo before saving.',
      timer: 2000,
      showConfirmButton: false
    });
    return;
  }

  const btn = document.getElementById('btnSaveStaffSelfAvatar');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>${currentLang === 'km' ? 'កំពុងរក្សាទុក...' : 'Saving...'}</span>`;
    if (window.lucide) lucide.createIcons();
  }

  // 1. Immediately cache in localStorage for instant offline & local availability
  try {
    localStorage.setItem('vst_staff_avatar_' + currentStaff.code, pendingSelfAvatarData);
  } catch (storageErr) {
    console.warn('LocalStorage avatar cache error:', storageErr);
  }

  currentStaff.avatar = pendingSelfAvatarData;
  saveStaffToStorage(currentStaff);

  const wrapper = document.getElementById('staffAvatarWrapper');
  if (wrapper) {
    wrapper.innerHTML = `<img src="${currentStaff.avatar}" alt="${currentStaff.name}" class="w-full h-full object-cover rounded-full block">`;
  }
  const drawerAvatar = document.getElementById('drawerAvatarWrapper');
  if (drawerAvatar) {
    drawerAvatar.innerHTML = `<img src="${currentStaff.avatar}" alt="${currentStaff.name}" class="w-full h-full object-cover rounded-full block">`;
  }

  if (publicInfo && publicInfo.members) {
    const idx = publicInfo.members.findIndex(m => m.code === currentStaff.code);
    if (idx !== -1) {
      publicInfo.members[idx].avatar = currentStaff.avatar;
    }
  }

  let serverSynced = false;
  let serverMessage = '';

  try {
    const res = await fetch('/api/staff/update-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: currentStaff.code,
        avatar: pendingSelfAvatarData
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.success) {
        serverSynced = true;
      } else {
        serverMessage = data.error || 'Server error';
      }
    } else {
      // Server returned HTML (e.g. 404 because server.js is not yet uploaded to GitHub)
      serverMessage = 'server_needs_update';
    }
  } catch (netErr) {
    console.warn('Network sync failed:', netErr);
    serverMessage = netErr.message;
  }

  closeStaffProfileModal();

  if (serverSynced) {
    Swal.fire({
      icon: 'success',
      title: currentLang === 'km' ? 'បានរក្សាទុករូបថតរួចរាល់!' : 'Profile Photo Updated!',
      text: currentLang === 'km' ? 'រូបថតផ្ទាល់ខ្លួនរបស់អ្នកត្រូវបានធ្វើបច្ចុប្បន្នភាព និង Sync ចូល Database ដោយជោគជ័យ។' : 'Your personal avatar has been successfully saved to the server.',
      timer: 2300,
      showConfirmButton: false
    });
  } else {
    // Show friendly success confirmation that it's active on their device, with reminder to push server.js
    Swal.fire({
      icon: 'success',
      title: currentLang === 'km' ? 'បានរក្សាទុកលើទូរសព្ទរបស់អ្នករួចរាល់! 📱' : 'Saved on this Device! 📱',
      html: `
        <p class="text-xs text-slate-600 mb-2 font-medium">
          ${currentLang === 'km' 
            ? 'រូបថតថ្មីរបស់អ្នកត្រូវបានចងចាំ និងបង្ហាញនៅលើទូរសព្ទនេះរួចរាល់ហើយ!' 
            : 'Your new avatar is saved and active on this device!'}
        </p>
        <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 text-left">
          <b>${currentLang === 'km' ? '📌 ការរំលឹកសម្រាប់ Admin:' : '📌 Admin Reminder:'}</b><br>
          ${currentLang === 'km' 
            ? 'ដើម្បីឱ្យរូបថតនេះ Sync ចូលទៅក្នុង Database Server ផងដែរ សូមប្រាកដថាអ្នកបាន Upload ឯកសារ <b>server.js</b> ទៅកាន់ GitHub!' 
            : 'To sync this avatar with the cloud database, please make sure <b>server.js</b> is uploaded to GitHub!'}
        </div>
      `,
      confirmButtonText: currentLang === 'km' ? 'យល់ព្រម' : 'OK',
      confirmButtonColor: '#06b6d4'
    });
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>${currentLang === 'km' ? 'រក្សាទុករូបថត' : 'Save Photo'}</span>`;
    if (window.lucide) lucide.createIcons();
  }
}

// 4. Auto Slot State & Visual Styling (Schedule: 08:00 - 11:00 | 13:00 - 17:00)
function setAttendanceSlot(slot) {
  currentScanAction = slot;

  const slotMeta = {
    morning_in: {
      icon: '1.',
      textKm: '1/4 ព្រឹកចូល (08:00)',
      textEn: '1/4 Morning In (08:00)',
    },
    lunch_out: {
      icon: '2.',
      textKm: '2/4 សម្រាកបាយ (11:00)',
      textEn: '2/4 Lunch Break (11:00)',
    },
    afternoon_in: {
      icon: '3.',
      textKm: '3/4 ចូលវិញ (13:00)',
      textEn: '3/4 Return In (13:00)',
    },
    evening_out: {
      icon: '4.',
      textKm: '4/4 ល្ងាចចេញ (17:00)',
      textEn: '4/4 Evening Out (17:00)',
    }
  };

  const info = slotMeta[slot] || slotMeta.morning_in;

  const iconEl = document.getElementById('heroSuggestedIcon');
  const textEl = document.getElementById('heroSuggestedText');
  if (iconEl) iconEl.textContent = info.icon;
  if (textEl) textEl.textContent = currentLang === 'km' ? info.textKm : info.textEn;

  const radarRing = document.getElementById('radarRing');
  const radarRingInner = document.getElementById('radarRingInner');

  if (radarRing) {
    radarRing.className = 'pulse-ring-outer absolute w-52 h-52 sm:w-60 sm:h-60 rounded-full border-2 border-brand-cyan/40 bg-gradient-to-r from-brand-blue/10 to-brand-purple/10 pointer-events-none';
  }
  if (radarRingInner) {
    radarRingInner.className = 'pulse-ring-inner absolute w-44 h-44 sm:w-50 sm:h-50 rounded-full border border-brand-blue/50 pointer-events-none';
  }
}

// Backward compatibility helper
function setAttendanceAction(action) {
  if (action === 'check_in') setAttendanceSlot('morning_in');
  else if (action === 'check_out') setAttendanceSlot('evening_out');
  else setAttendanceSlot(action);
}

function triggerStaffScan() {
  if (todayScansTotalCount >= 4) {
    Swal.fire({
      icon: 'info',
      title: currentLang === 'km' ? 'គ្រប់ 4/4 ដងរួចរាល់' : 'All Scans Completed',
      text: currentLang === 'km' 
        ? 'អ្នកបានស្កេនគ្រប់ចំនួន ៤ ដង (4/4) សម្រាប់ថ្ងៃនេះរួចរាល់ហើយ! មិនអាចស្កេនបន្ថែមទៀតបានទេ។' 
        : 'You have completed all 4 scans (4/4) for today.',
      confirmButtonColor: '#0ea5e9'
    });
    return;
  }
  openStaffScannerModal(currentScanAction);
}

// 5. GPS Geofencing & Distance Tracking
function initStaffGPS() {
  if (!navigator.geolocation) {
    updateStaffGpsUI(null, null, currentLang === 'km' ? 'Browser មិនគាំទ្រ GPS ទេ' : 'Browser does not support GPS');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      userCoords.lat = pos.coords.latitude;
      userCoords.lng = pos.coords.longitude;
      updateStaffGpsUI(userCoords.lat, userCoords.lng);
    },
    err => {
      console.warn('GPS error:', err.message);
      updateStaffGpsUI(null, null, translations[currentLang].gpsAllow);
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function refreshStaffGPS() {
  if (!navigator.geolocation) return;
  document.getElementById('gpsChipTitle').textContent = translations[currentLang].gpsWaiting;
  navigator.geolocation.getCurrentPosition(
    pos => {
      userCoords.lat = pos.coords.latitude;
      userCoords.lng = pos.coords.longitude;
      updateStaffGpsUI(userCoords.lat, userCoords.lng);
      Swal.fire({
        toast: true, position: 'top-end', icon: 'success',
        title: currentLang === 'km' ? 'បាន Refresh GPS រួចរាល់' : 'GPS Refreshed Successfully',
        showConfirmButton: false, timer: 1500
      });
    },
    err => {
      Swal.fire({ icon: 'warning', title: translations[currentLang].alertGpsDenied });
    },
    { enableHighAccuracy: true }
  );
}

function openOfficeOnMaps() {
  if (!publicInfo || isNaN(publicInfo.officeLat) || isNaN(publicInfo.officeLng)) {
    Swal.fire({ icon: 'info', title: 'Location info not available' });
    return;
  }
  const url = `https://www.google.com/maps?q=${publicInfo.officeLat},${publicInfo.officeLng}`;
  window.open(url, '_blank');
}

function updateStaffGpsUI(lat, lng, errorMsg) {
  const chipContainer = document.getElementById('gpsChipContainer');
  const chipIcon = document.getElementById('gpsChipIcon');
  const chipTitle = document.getElementById('gpsChipTitle');
  const chipSubtitle = document.getElementById('gpsChipSubtitle');
  const t = translations[currentLang];

  if (lat && lng && publicInfo) {
    const dist = calculateDistance(lat, lng, publicInfo.officeLat, publicInfo.officeLng);
    if (dist <= publicInfo.allowedRadius) {
      chipTitle.textContent = t.inOffice;
      chipSubtitle.textContent = currentLang === 'km' 
        ? `ចម្ងាយត្រឹម ${dist} ម៉ែត្រ (ក្នុងដែន ${publicInfo.allowedRadius}m)`
        : `Within ${dist} meters (Radius: ${publicInfo.allowedRadius}m)`;
      chipContainer.className = 'p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between transition-colors shadow-xs';
      chipIcon.className = 'w-8 h-8 rounded-xl bg-accent-success text-white flex items-center justify-center text-xs shadow-xs';
    } else {
      const distKm = dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : dist + (currentLang === 'km' ? ' ម៉ែត្រ' : ' m');
      chipTitle.textContent = t.outOffice;
      chipSubtitle.textContent = currentLang === 'km' 
        ? `ចម្ងាយ ${distKm} ពីការិយាល័យ (ដែន ${publicInfo.allowedRadius}m)`
        : `${distKm} away from office (Radius: ${publicInfo.allowedRadius}m)`;
      chipContainer.className = 'p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between transition-colors shadow-xs';
      chipIcon.className = 'w-8 h-8 rounded-xl bg-accent-warning text-white flex items-center justify-center text-xs shadow-xs';
    }
  } else {
    chipTitle.textContent = errorMsg || t.gpsWaiting;
    chipSubtitle.textContent = t.gpsAllow;
    chipContainer.className = 'p-3.5 rounded-xl bg-white/70 border border-app-border flex items-center justify-between transition-colors shadow-xs';
    chipIcon.className = 'w-8 h-8 rounded-xl bg-white border border-app-border text-brand-blue flex items-center justify-center text-xs shadow-xs';
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// 6. Camera Scanner Modal
async function openStaffScannerModal(actionType) {
  if (!currentStaff) {
    Swal.fire({
      icon: 'info',
      title: currentLang === 'km' ? 'សូមកំណត់ឈ្មោះជាមុនសិន' : 'Please select your profile first',
      text: currentLang === 'km' ? 'សូមជ្រើសរើសឈ្មោះរបស់អ្នកក្នុងប្រអប់ខាងលើ' : 'Choose your name in the dropdown above'
    });
    return;
  }

  if (todayScansTotalCount >= 4) {
    Swal.fire({
      icon: 'info',
      title: currentLang === 'km' ? 'គ្រប់ 4/4 ដងរួចរាល់' : 'All Scans Completed',
      text: currentLang === 'km' 
        ? 'អ្នកបានស្កេនគ្រប់ចំនួន ៤ ដង (4/4) សម្រាប់ថ្ងៃនេះរួចរាល់ហើយ! មិនអាចស្កេនបន្ថែមទៀតបានទេ។' 
        : 'You have completed all 4 scans (4/4) for today.',
      confirmButtonColor: '#0ea5e9'
    });
    return;
  }

  currentScanAction = actionType;
  const badge = document.getElementById('staffScanModalBadge');
  const slotBadges = {
    morning_in: { text: currentLang === 'km' ? '🌅 1/4 ព្រឹកចូល' : '🌅 1/4 Morning In', class: 'px-3 py-1 rounded-full text-xs font-black bg-cyan-500 text-white' },
    lunch_out: { text: currentLang === 'km' ? '🍱 2/4 ចេញបាយ' : '🍱 2/4 Lunch Out', class: 'px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-white' },
    afternoon_in: { text: currentLang === 'km' ? '☕ 3/4 រសៀលចូល' : '☕ 3/4 Afternoon In', class: 'px-3 py-1 rounded-full text-xs font-black bg-sky-500 text-white' },
    evening_out: { text: currentLang === 'km' ? '🏠 4/4 ល្ងាចចេញ' : '🏠 4/4 Evening Out', class: 'px-3 py-1 rounded-full text-xs font-black bg-rose-500 text-white' },
    check_in: { text: '🟢 Check-In', class: 'px-3 py-1 rounded-full text-xs font-black bg-cyan-500 text-white' },
    check_out: { text: '🔴 Check-Out', class: 'px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-white' }
  };
  const bInfo = slotBadges[actionType] || { text: actionType, class: 'px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-white' };
  if (badge) {
    badge.textContent = bInfo.text;
    badge.className = bInfo.class;
  }

  document.getElementById('staffScannerModal').classList.remove('hidden');

  try {
    staffScanner = new Html5Qrcode("staff-qr-reader");
    await staffScanner.start(
      { facingMode: "environment" },
      { 
        fps: 12, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
          return { width: Math.max(180, edge), height: Math.max(180, edge) };
        }
      },
      onOfficeQrCodeScanned,
      () => {}
    );
    isStaffScannerRunning = true;
  } catch (err) {
    console.error('Camera open error:', err);
    closeStaffScannerModal();
    Swal.fire({
      icon: 'error',
      title: currentLang === 'km' ? 'មិនអាចបើកកាមេរ៉ាបានទេ' : 'Camera Access Failed',
      text: currentLang === 'km' ? 'សូមពិនិត្យមើលសិទ្ធិអនុញ្ញាត Camera លើទូរស័ព្ទរបស់អ្នក' : 'Please check camera permissions in your browser'
    });
  }
}

async function closeStaffScannerModal() {
  if (isStaffScannerRunning && staffScanner) {
    try {
      await staffScanner.stop();
      staffScanner.clear();
    } catch (e) {}
    isStaffScannerRunning = false;
  }
  document.getElementById('staffScannerModal').classList.add('hidden');
}

let isSubmitting = false;
async function onOfficeQrCodeScanned(decodedText) {
  if (isSubmitting) return;

  if (todayScansTotalCount >= 4) {
    await closeStaffScannerModal();
    Swal.fire({
      icon: 'info',
      title: currentLang === 'km' ? 'គ្រប់ 4/4 ដងរួចរាល់' : 'All Scans Completed',
      text: currentLang === 'km' 
        ? 'អ្នកបានស្កេនគ្រប់ចំនួន ៤ ដង (4/4) សម្រាប់ថ្ងៃនេះរួចរាល់ហើយ! មិនអាចស្កេនបន្ថែមទៀតបានទេ។' 
        : 'You have completed all 4 scans (4/4) for today.',
      confirmButtonColor: '#0ea5e9'
    });
    return;
  }

  isSubmitting = true;
  playBeep();
  await closeStaffScannerModal();

  // Check Cambodia Time (UTC+7) for Late Check-In or Early Check-Out
  const now = new Date();
  const cambodiaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  const cambodiaDate = new Date(cambodiaStr);
  const hours = cambodiaDate.getHours();
  const minutes = cambodiaDate.getMinutes();
  const totalMins = hours * 60 + minutes;

  function formatDurationUi(mins) {
    const m = Math.abs(Math.round(mins || 0));
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (currentLang === 'km') {
      if (h > 0) return rem > 0 ? `${h} ម៉ោង ${rem} នាទី` : `${h} ម៉ោង`;
      return `${rem} នាទី`;
    } else {
      if (h > 0) return rem > 0 ? `${h} hr ${rem} min` : `${h} hr`;
      return `${rem} min`;
    }
  }

  let promptReason = false;
  let promptTitle = '';
  let promptSubtitle = '';

  if (currentScanAction === 'morning_in' && totalMins > 490) { // After 08:10
    const lateMins = totalMins - 480;
    const diffStr = formatDurationUi(lateMins);
    promptReason = true;
    promptTitle = currentLang === 'km' ? `⚠️ អ្នកមកយឺត ${diffStr}` : `⚠️ Late by ${diffStr}`;
    promptSubtitle = currentLang === 'km' 
      ? 'ម៉ោងចូលធ្វើការគឺ 08:00 AM (អនុគ្រោះត្រឹម 08:10)។ សូមបញ្ជាក់មូលហេតុដែលអ្នកមកយឺត:' 
      : 'Work starts at 08:00 AM. Please state your reason for being late:';
  } else if (currentScanAction === 'lunch_out' && totalMins < 650) { // Before 10:50
    const earlyMins = 660 - totalMins;
    const diffStr = formatDurationUi(earlyMins);
    promptReason = true;
    promptTitle = currentLang === 'km' ? `🏃💨 អ្នកចេញមុនម៉ោង ${diffStr}` : `🏃💨 Early leave by ${diffStr}`;
    promptSubtitle = currentLang === 'km' 
      ? 'ម៉ោងចេញសម្រាកបាយគឺ 11:00 AM (អនុញ្ញាតចាប់ពី 10:50)។ សូមបញ្ជាក់មូលហេតុដែលអ្នកចេញមុន:' 
      : 'Lunch break is at 11:00 AM. Please state your reason for leaving early:';
  } else if (currentScanAction === 'afternoon_in' && totalMins > 790) { // After 13:10
    const lateMins = totalMins - 780;
    const diffStr = formatDurationUi(lateMins);
    promptReason = true;
    promptTitle = currentLang === 'km' ? `⚠️ អ្នកមកយឺត ${diffStr}` : `⚠️ Late by ${diffStr}`;
    promptSubtitle = currentLang === 'km' 
      ? 'ម៉ោងចូលរសៀលគឺ 01:00 PM (អនុគ្រោះត្រឹម 01:10)។ សូមបញ្ជាក់មូលហេតុដែលអ្នកមកយឺត:' 
      : 'Afternoon starts at 01:00 PM. Please state your reason for being late:';
  } else if (currentScanAction === 'evening_out' && totalMins < 1010) { // Before 16:50
    const earlyMins = 1020 - totalMins;
    const diffStr = formatDurationUi(earlyMins);
    promptReason = true;
    promptTitle = currentLang === 'km' ? `🏃💨 អ្នកចេញមុនម៉ោង ${diffStr}` : `🏃💨 Early leave by ${diffStr}`;
    promptSubtitle = currentLang === 'km' 
      ? 'ម៉ោងចេញធ្វើការគឺ 05:00 PM (អនុញ្ញាតចាប់ពី 04:50)។ សូមបញ្ជាក់មូលហេតុដែលអ្នកចេញមុន:' 
      : 'End of work is at 05:00 PM. Please state your reason for leaving early:';
  }

  let staffReason = '';
  if (promptReason) {
    const reasonResult = await Swal.fire({
      title: promptTitle,
      text: promptSubtitle,
      input: 'textarea',
      inputPlaceholder: currentLang === 'km' ? 'ឧ. ស្ទះចរាចរណ៍, ឈឺ/មិនស្រួលខ្លួន, មានធុរៈផ្ទាល់ខ្លួន...' : 'e.g. Traffic jam, doctor appointment...',
      icon: 'warning',
      confirmButtonText: currentLang === 'km' ? 'បញ្ជាក់ និងកត់ត្រាវត្តមាន' : 'Confirm & Check In',
      cancelButtonText: currentLang === 'km' ? 'បោះបង់' : 'Cancel',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      allowOutsideClick: false,
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return currentLang === 'km' ? 'សូមបញ្ចូលមូលហេតុរបស់អ្នកជាមុនសិន!' : 'Please enter your reason!';
        }
      }
    });

    if (!reasonResult.isConfirmed) {
      isSubmitting = false;
      return;
    }
    staffReason = (reasonResult.value || '').trim();
  }

  try {
    const res = await fetch('/api/attendance/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: currentStaff.code,
        type: currentScanAction,
        qr_token: decodedText.trim(),
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        note: staffReason,
        device_id: getOrCreateDeviceId()
      })
    });

    let data = {};
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (parseErr) {
        data = { error: 'ទម្រង់ឆ្លើយតបមិនត្រឹមត្រូវ (JSON parse error)' };
      }
    } else {
      const rawText = await res.text().catch(() => '');
      data = { error: rawText.includes('<') ? (currentLang === 'km' ? 'បញ្ហា Server (HTTP ' + res.status + ')' : 'Server Error (HTTP ' + res.status + ')') : rawText };
    }

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: translations[currentLang].alertFailed,
        text: data.error || (currentLang === 'km' ? 'ការផ្ទៀងផ្ទាត់វត្តមានមិនជោគជ័យ' : 'Attendance verification failed'),
        confirmButtonColor: '#f59e0b'
      });
      isSubmitting = false;
      return;
    }

    const slotLabels = {
      morning_in: { km: '🌅 1/4 ព្រឹកចូល (08:00)', en: '🌅 1/4 Morning In (08:00)' },
      lunch_out: { km: '🍱 2/4 សម្រាកបាយ (11:00)', en: '🍱 2/4 Lunch Break (11:00)' },
      afternoon_in: { km: '☕ 3/4 ចូលវិញ (13:00)', en: '☕ 3/4 Return In (13:00)' },
      evening_out: { km: '🏠 4/4 ល្ងាចចេញ (17:00)', en: '🏠 4/4 Evening Out (17:00)' }
    };
    const slotLabel = slotLabels[data.actionType] ? (currentLang === 'km' ? slotLabels[data.actionType].km : slotLabels[data.actionType].en) : data.actionType;

    const locNote = data.isWithinRange
      ? `<span class="text-cyan-400 font-bold">✅ ${currentLang === 'km' ? 'នៅក្នុងការិយាល័យ' : 'At Office'} (${data.distance !== null ? data.distance + 'm' : 'OK'})</span>`
      : `<span class="text-amber-400 font-bold">⚠️ ${currentLang === 'km' ? 'ក្រៅបរិវេណ' : 'Outside Office'} (${data.distance}m)</span>`;

    const sundayBadge = data.isSunday ? `<div class="text-[11px] text-amber-300 font-bold bg-amber-500/10 p-2 rounded-xl border border-amber-500/20 mt-2">🏖️ ${currentLang === 'km' ? 'ស្កេនថ្ងៃអាទិត្យ (OT / សម្រាក)' : 'Sunday Scan (Day Off / OT)'}</div>` : '';

    const reasonDisplay = data.note ? `<div class="text-xs text-amber-200 bg-amber-500/15 p-2 rounded-xl border border-amber-500/25 mt-2">📝 <b>${currentLang === 'km' ? 'មូលហេតុ' : 'Reason'}:</b> ${data.note}</div>` : '';

    Swal.fire({
      icon: 'success',
      title: currentLang === 'km' ? data.message : 'Attendance Recorded!',
      html: `
        <div class="text-left bg-slate-950/80 p-4 rounded-2xl border border-white/10 mt-3 space-y-2.5 text-xs text-slate-300 shadow-inner">
          <div class="flex items-center justify-between pb-2.5 border-b border-white/10">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-300 font-bold text-xs shadow-inner">
                ${data.member.name ? data.member.name.trim().charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <div class="font-bold text-white text-xs sm:text-sm">${data.member.name}</div>
                <div class="text-[10px] text-slate-400 font-mono">${data.member.code} • ${data.member.role || (currentLang === 'km' ? 'បុគ្គលិក' : 'Staff')}</div>
              </div>
            </div>
            <span class="px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 text-[10px] font-mono font-bold">
              ${data.todayScansCount}/4 ស្កេន
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-1 text-[11px]">
            <div class="p-2 rounded-xl bg-white/[0.03] border border-white/5">
              <span class="text-slate-400 block text-[10px] mb-0.5">វេនវត្តមាន (Slot)</span>
              <span class="font-bold text-white">${slotLabel}</span>
            </div>
            <div class="p-2 rounded-xl bg-white/[0.03] border border-white/5">
              <span class="text-slate-400 block text-[10px] mb-0.5">ទីតាំងការិយាល័យ</span>
              <span class="font-bold">${locNote}</span>
            </div>
          </div>
          ${data.statusText ? `<div class="pt-1 text-[11px] text-slate-300">${data.statusText}</div>` : ''}
          ${reasonDisplay}
          ${sundayBadge}
          <div class="text-[10px] ${data.telegramSent === true ? 'text-sky-400' : 'text-amber-300'} pt-2 border-t border-white/10 flex items-center gap-1.5 font-medium">
            <i class="fa-brands fa-telegram text-sm"></i>
            <span>${data.telegramSent === true
              ? (currentLang === 'km' ? 'បានផ្ញើទៅ Telegram រួចរាល់' : 'Sent to Telegram')
              : (currentLang === 'km' ? 'វត្តមានបានកត់ត្រា ប៉ុន្តែមិនអាចបញ្ជាក់ការផ្ញើទៅ Telegram បាន។ សូមកុំចុចម្ដងទៀត។' : 'Attendance saved, but Telegram delivery was not confirmed. Please do not check in again.')}</span>
          </div>
        </div>
      `,
      confirmButtonText: translations[currentLang].confirmBtn
    });

    loadMyAttendanceActivity();

  } catch (err) {
    console.error('Attendance submit error:', err);
    Swal.fire({ 
      icon: 'error', 
      title: currentLang === 'km' ? 'បញ្ហាប្រព័ន្ធ / អ៊ីនធឺណិត' : 'Network Error', 
      text: err.message || (currentLang === 'km' ? 'មិនអាចទាក់ទងម៉ាស៊ីនបម្រើបានទេ' : 'Failed to connect to server'),
      confirmButtonColor: '#f59e0b'
    });
  } finally {
    isSubmitting = false;
  }
}

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}
}

// 7. Load Staff's Own Attendance Activity & Today 4-Slot Status
async function loadMyAttendanceActivity() {
  if (!currentStaff) return;
  const t = translations[currentLang] || translations.km;
  const loc = currentLang === 'km' ? 'km-KH' : 'en-US';

  try {
    const sumRes = await fetch(`/api/attendance/today-summary?code=${encodeURIComponent(currentStaff.code)}`);
    if (!sumRes.ok) return;
    const summary = await sumRes.json();

    // Update Sunday warning banner
    const sundayEl = document.getElementById('sundayWarningBadge');
    if (sundayEl) {
      if (summary.isSunday) {
        sundayEl.classList.remove('hidden');
      } else {
        sundayEl.classList.add('hidden');
      }
    }

    // Update Total Scans badge & 4-Segment Progress Bar
    const totalDone = summary.totalScansToday || 0;
    // ACLEDA Circular Progress & Working Duration Updates
    const circleEl = document.getElementById('acledaProgressCircle');
    const circleTxt = document.getElementById('acledaProgressText');
    const miniBadge = document.getElementById('todayScansMiniBadge');
    if (circleEl) {
      const circOffset = 201 - (Math.min(4, totalDone) / 4) * 201;
      circleEl.style.strokeDashoffset = circOffset;
    }
    if (circleTxt) circleTxt.textContent = totalDone + '/4';
    if (miniBadge) miniBadge.textContent = totalDone + '/4';

    // Calculate Working Duration (Hours & Minutes)
    let workedMinutes = 0;
    const slots = summary.slots || {};
    const now = new Date();

    if (slots.morning_in) {
      const tIn = new Date(slots.morning_in.timestamp);
      if (slots.lunch_out) {
        const tOut = new Date(slots.lunch_out.timestamp);
        workedMinutes += Math.max(0, Math.round((tOut - tIn) / 60000));
      } else {
        workedMinutes += Math.max(0, Math.round((now - tIn) / 60000));
      }
    }
    if (slots.afternoon_in) {
      const tIn2 = new Date(slots.afternoon_in.timestamp);
      if (slots.evening_out) {
        const tOut2 = new Date(slots.evening_out.timestamp);
        workedMinutes += Math.max(0, Math.round((tOut2 - tIn2) / 60000));
      } else {
        workedMinutes += Math.max(0, Math.round((now - tIn2) / 60000));
      }
    }
    const durH = Math.floor(workedMinutes / 60);
    const durM = workedMinutes % 60;
    const durEl = document.getElementById('acledaWorkDurationText');
    if (durEl && !durEl.dataset.blurred) {
      durEl.textContent = `${durH} ម៉ោង ${durM} នាទី`;
    }

    // Update Hero 1-Click Action Button Text
    const heroTitle = document.getElementById('heroBtnActionTitle');
    const heroSub = document.getElementById('heroBtnActionSubtitle');
    const heroIcon = document.getElementById('heroBtnActionIcon');
    if (totalDone >= 4) {
      if (heroTitle) heroTitle.textContent = 'គ្រប់ ៤/៤ ដងរួចរាល់';
      if (heroSub) heroSub.textContent = 'បានបញ្ចប់វត្តមានថ្ងៃនេះ';
    } else {
      const nextSlot = summary.nextSuggestedSlot || 'morning_in';
      const slotTitles = {
        morning_in: 'ចុចចូលព្រឹក (08:00)',
        lunch_out: 'ចុចចេញបាយ (11:00)',
        afternoon_in: 'ចុចចូលរសៀល (13:00)',
        evening_out: 'ចុចចេញល្ងាច (17:00)'
      };
      if (heroTitle) heroTitle.textContent = slotTitles[nextSlot] || 'ចុចកត់ត្រាវត្តមាន';
      if (heroSub) heroSub.textContent = '1-Click (Wi-Fi ក្រុមហ៊ុន)';
    }

    const countEl = document.getElementById('todayScansCountText');
    if (countEl) {
      countEl.textContent = totalDone;
    }

    // Animate 4-segment progress track
    const segColors = [
      'bg-gradient-to-r from-cyan-500 to-sky-500 shadow-xs shadow-cyan-500/50',
      'bg-gradient-to-r from-amber-500 to-orange-500 shadow-xs shadow-amber-500/50',
      'bg-gradient-to-r from-sky-500 to-blue-500 shadow-xs shadow-sky-500/50',
      'bg-gradient-to-r from-rose-500 to-pink-500 shadow-xs shadow-rose-500/50'
    ];
    // Animate 4-segment progress track with premium blue-cyan gradient
    for (let i = 1; i <= 4; i++) {
      const segEl = document.getElementById(`progBarSeg${i}`);
      if (segEl) {
        if (i <= totalDone) {
          segEl.className = 'h-2 rounded-full bg-gradient-to-r from-brand-blue to-brand-cyan shadow-xs shadow-brand-blue/30 transition-all duration-300';
        } else {
          segEl.className = 'h-2 rounded-full bg-slate-200/80 transition-all duration-300';
        }
      }
    }

    // Helper to format slot card status & color
    function updateSlotCard(slotKey, cardId, timeId, statusId, defaultNameKm, defaultNameEn, slotNum) {
      const card = document.getElementById(cardId);
      const timeEl = document.getElementById(timeId);
      const statusEl = document.getElementById(statusId);
      const record = summary.slots && summary.slots[slotKey];
      if (!card) return;

      const titleEl = card.querySelector('span:first-child');
      const pillEl = card.querySelector('div > div > span:last-child');

      if (record) {
        // Completed step: Translucent emerald glass success appearance (NO WHITE GLARE)
        const timeStr = new Date(record.timestamp).toLocaleTimeString('en-US', { 
          timeZone: 'Asia/Phnom_Penh', 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: true 
        });
        if (timeEl) {
          timeEl.textContent = timeStr;
          timeEl.className = 'text-base font-extrabold text-white font-mono mt-1';
        }
        const rangeText = record.is_within_range 
          ? (currentLang === 'km' ? '✅ ការិយាល័យ' : '✅ Office') 
          : `⚠️ (${record.distance_meters !== null ? record.distance_meters + 'm' : 'ក្រៅ'})`;
        if (statusEl) {
          statusEl.textContent = rangeText;
          statusEl.className = record.is_within_range 
            ? 'text-xs text-emerald-300 font-bold mt-1.5 flex items-center gap-1' 
            : 'text-xs text-amber-300 font-bold mt-1.5 flex items-center gap-1';
        }
        card.className = 'p-3.5 rounded-2xl bg-emerald-500/15 border-2 border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.2)] flex flex-col justify-between transition-all';
        if (titleEl) titleEl.className = 'text-[11px] font-bold text-emerald-300';
        if (pillEl) pillEl.className = 'text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30';
      } else if (summary.nextSuggestedSlot === slotKey && todayScansTotalCount < 4) {
        // Current step (ដល់ពេលស្កេន): Vibrant Cyan-Blue Glass with Glowing Border (NO WHITE GLARE, HIGH CONTRAST)
        if (timeEl) {
          timeEl.textContent = '--:--';
          timeEl.className = 'text-base font-extrabold text-white font-mono mt-1';
        }
        if (statusEl) {
          statusEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span><span>${currentLang === 'km' ? 'ស្កេនបន្ទាប់' : 'Next Step'}</span>`;
          statusEl.className = 'text-xs text-cyan-300 font-extrabold mt-1.5 flex items-center gap-1.5 animate-pulse';
        }
        card.className = 'p-3.5 rounded-2xl bg-gradient-to-br from-cyan-500/25 via-blue-600/20 to-indigo-600/15 border-2 border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.45)] flex flex-col justify-between transition-all scale-[1.02] ring-2 ring-cyan-400/30';
        if (titleEl) titleEl.className = 'text-[11px] font-bold text-cyan-200';
        if (pillEl) pillEl.className = 'text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-200 border border-cyan-400/40';
      } else {
        // Future step: Neutral subtle dark crystal glass
        if (timeEl) {
          timeEl.textContent = '--:--';
          timeEl.className = 'text-base font-extrabold text-slate-400 font-mono mt-1';
        }
        if (statusEl) {
          statusEl.textContent = t.waiting || 'រង់ចាំ';
          statusEl.className = 'text-xs text-slate-400 mt-1.5';
        }
        card.className = 'p-3.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between transition-all';
        if (titleEl) titleEl.className = 'text-[11px] font-bold text-slate-300';
        if (pillEl) pillEl.className = 'text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-400';
      }
    }

    updateSlotCard('morning_in', 'cardSlotMorningIn', 'timeSlotMorningIn', 'statusSlotMorningIn', 'ព្រឹកចូល', 'Morning In', 1);
    updateSlotCard('lunch_out', 'cardSlotLunchOut', 'timeSlotLunchOut', 'statusSlotLunchOut', 'សម្រាកបាយ', 'Lunch Break', 2);
    updateSlotCard('afternoon_in', 'cardSlotAfternoonIn', 'timeSlotAfternoonIn', 'statusSlotAfternoonIn', 'ចូលវិញ', 'Return In', 3);
    updateSlotCard('evening_out', 'cardSlotEveningOut', 'timeSlotEveningOut', 'statusSlotEveningOut', 'ល្ងាចចេញ', 'Evening Out', 4);

    // Update Top Right Status Badge
    const badgeEl = document.getElementById('badgeTodayStatus');
    if (badgeEl) {
      if (!summary.totalScansToday || summary.totalScansToday === 0) {
        badgeEl.textContent = t.notCheckedIn;
        badgeEl.className = 'px-3 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800/80 text-slate-400 border border-slate-700/60 shadow-xs';
      } else if (summary.totalScansToday < 4) {
        badgeEl.textContent = `${currentLang === 'km' ? 'កំពុងបំពេញការងារ' : 'On Duty'} (${summary.totalScansToday}/4)`;
        badgeEl.className = 'px-3 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-xs';
      } else {
        badgeEl.textContent = currentLang === 'km' ? 'គ្រប់ 4/4 ដងរួចរាល់' : 'All 4 Scans Done';
        badgeEl.className = 'px-3 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-xs';
      }
    }

    // Auto-select next suggested slot if available
    todayScansTotalCount = summary.totalScansToday || 0;
    if (summary.nextSuggestedSlot && summary.nextSuggestedSlot !== 'completed' && todayScansTotalCount < 4) {
      setAttendanceSlot(summary.nextSuggestedSlot);
    } else {
      const iconEl = document.getElementById('heroSuggestedIcon');
      const textEl = document.getElementById('heroSuggestedText');
      if (iconEl) iconEl.textContent = '✅';
      if (textEl) textEl.textContent = currentLang === 'km' ? 'គ្រប់ 4/4 ដងរួចរាល់សម្រាប់ថ្ងៃនេះ' : 'All 4 Scans Completed Today';
    }

    // 2. Fetch Recent 5 activity logs for the member
    const res = await fetch(`/api/attendance?code=${encodeURIComponent(currentStaff.code)}&limit=10`);
    if (!res.ok) return;
    const logs = await res.json();
    const listContainer = document.getElementById('myRecentScansList');
    if (!logs || logs.length === 0) {
      if (listContainer) listContainer.innerHTML = `<div class="py-6 text-center text-xs text-txt-muted">${t.noDataYet}</div>`;
      return;
    }

    const slotLabels = {
      morning_in: { text: '1/4 ព្រឹកចូល (08:00)', enText: '1/4 Morning In (08:00)', icon: 'log-in' },
      lunch_out: { text: '2/4 សម្រាកបាយ (11:00)', enText: '2/4 Lunch Break (11:00)', icon: 'utensils' },
      afternoon_in: { text: '3/4 ចូលវិញ (13:00)', enText: '3/4 Return In (13:00)', icon: 'coffee' },
      evening_out: { text: '4/4 ល្ងាចចេញ (17:00)', enText: '4/4 Evening Out (17:00)', icon: 'log-out' },
      check_in: { text: 'Check-In', enText: 'Check-In', icon: 'log-in' },
      check_out: { text: 'Check-Out', enText: 'Check-Out', icon: 'log-out' }
    };

    if (listContainer) {
      listContainer.innerHTML = logs.slice(0, 5).map(l => {
        const meta = slotLabels[l.type] || { text: l.type, enText: l.type, icon: 'check-circle' };
        const labelStr = currentLang === 'km' ? meta.text : meta.enText;
        const timeStr = new Date(l.timestamp).toLocaleString(loc, { 
          timeZone: 'Asia/Phnom_Penh',
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
        });
        const rangeText = l.is_within_range ? (currentLang === 'km' ? 'ការិយាល័យ' : 'Office') : `(${l.distance_meters !== null ? l.distance_meters + 'm' : 'ក្រៅ'})`;
        const noteHtml = l.note ? `<p class="text-[11px] text-amber-300 font-medium mt-0.5">📝 ${l.note}</p>` : '';

        return `
          <div class="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-xs">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 flex-shrink-0">
                <i data-lucide="${meta.icon}" class="w-4 h-4"></i>
              </div>
              <div>
                <span class="font-bold text-white notranslate" translate="no">${labelStr}</span>
                <p class="text-[11px] text-slate-400 font-mono mt-0.5">${timeStr}</p>
                ${noteHtml}
              </div>
            </div>
            <span class="text-xs font-semibold ${l.is_within_range ? 'text-emerald-400' : 'text-amber-400'}">
              ${rangeText}
            </span>
          </div>
        `;
      }).join('');
      if (window.lucide) lucide.createIcons();
    }

  } catch (err) {
    console.error('Failed to load my attendance:', err);
  }
}

// 8. Admin Portal Authentication & Switching
async function promptAdminPin() {
  const t = translations[currentLang];
  const result = await Swal.fire({
    title: t.pinPromptTitle,
    text: t.pinPromptInput,
    input: 'password',
    inputPlaceholder: '••••',
    showCancelButton: true,
    confirmButtonText: t.confirmBtn,
    cancelButtonText: t.cancel,
    showLoaderOnConfirm: true,
    inputAttributes: {
      inputmode: 'numeric',
      pattern: '[0-9]*',
      maxlength: '10',
      autocomplete: 'current-password',
      style: 'text-align: center; font-size: 1.5rem; letter-spacing: 0.35em; font-family: monospace;'
    },
    preConfirm: async (pin) => {
      if (!pin) {
        Swal.showValidationMessage(currentLang === 'km' ? 'សូមបញ្ចូលលេខកូដសម្ងាត់ Admin PIN' : 'Please enter Admin PIN');
        return false;
      }
      try {
        const res = await fetch('/api/admin/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: pin.trim() })
        });
        const data = await res.json();
        if (!res.ok) {
          Swal.showValidationMessage(data.error || (currentLang === 'km' ? 'លេខកូដ PIN មិនត្រឹមត្រូវទេ!' : 'Invalid Admin PIN'));
          return false;
        }
        return data;
      } catch (err) {
        Swal.showValidationMessage(currentLang === 'km' ? 'បញ្ហាប្រព័ន្ធ / អ៊ីនធឺណិត' : 'Network error');
        return false;
      }
    },
    allowOutsideClick: () => !Swal.isLoading()
  });

  if (result.isConfirmed && result.value) {
    isAdminAuthenticated = true;
    showAdminView();
  }
}

function showAdminView() {
  const loginV = document.getElementById('loginView');
  if (loginV) loginV.classList.add('hidden');
  const staffV = document.getElementById('staffView');
  if (staffV) staffV.classList.add('hidden');
  const staffHistV = document.getElementById('staffHistoryView');
  if (staffHistV) staffHistV.classList.add('hidden');
  const adminV = document.getElementById('adminView');
  if (adminV) {
    adminV.classList.remove('hidden');
    applyViewMotion(adminV);
  }

  const btnAdmin = document.getElementById('btnSwitchToAdmin');
  if (btnAdmin) btnAdmin.classList.add('hidden');
  const btnStaff = document.getElementById('btnSwitchToStaff');
  if (btnStaff) btnStaff.classList.remove('hidden');
  const btnLogout = document.getElementById('btnStaffLogoutTop');
  if (btnLogout) btnLogout.classList.add('hidden');

  // Hide bottom nav in Admin View completely
  toggleBottomNav(false);

  switchAdminTab('dashboard');
  loadAdminDashboard();
}

// (showStaffView is defined above)

function lockAdmin() {
  isAdminAuthenticated = false;
  if (currentStaff) {
    showStaffView();
  } else {
    showLoginView();
  }
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.adm-tab').forEach(b => {
    b.classList.remove('text-white', 'bg-gradient-to-r', 'from-blue-600', 'via-cyan-500', 'to-teal-400', 'border-cyan-300/40', 'font-extrabold', 'shadow-lg', 'shadow-cyan-500/25');
    b.classList.add('text-slate-300', 'hover:text-white', 'hover:bg-slate-800/70', 'border-transparent', 'font-semibold');
  });
  const activeBtn = document.getElementById(`adm-tab-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-300', 'hover:text-white', 'hover:bg-slate-800/70', 'border-transparent', 'font-semibold');
    activeBtn.classList.add('text-white', 'bg-gradient-to-r', 'from-blue-600', 'via-cyan-500', 'to-teal-400', 'border-cyan-300/40', 'font-extrabold', 'shadow-lg', 'shadow-cyan-500/25');
  }

  document.querySelectorAll('.adm-section').forEach(s => s.classList.add('hidden'));
  const activeSec = document.getElementById(`adm-sec-${tabId}`);
  if (activeSec) {
    activeSec.classList.remove('hidden', 'adm-section-motion');
    void activeSec.offsetWidth;
    activeSec.classList.add('adm-section-motion');
  }

  if (window.lucide) lucide.createIcons();

  if (tabId === 'dashboard') {
    loadAdminDashboard();
    loadPendingMembers();
    loadAdminLeaveRequests();
  }
  if (tabId === 'members') {
    loadAdminMembers();
    loadPendingMembers();
  }
  if (tabId === 'leaves') {
    loadAdminLeaveRequests();
  }
  if (tabId === 'history') loadAttendanceHistory();
  if (tabId === 'settings') loadAdminSettings();
}

// 9. Admin Dashboard Data
async function loadAdminDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    const data = await res.json();

    const statMembers = document.getElementById('statTotalMembers');
    if (statMembers) statMembers.textContent = data.totalMembers ?? 0;
    const statIns = document.getElementById('statTodayCheckIns');
    if (statIns) statIns.textContent = data.todayCheckIns ?? 0;
    const statOuts = document.getElementById('statTodayCheckOuts');
    if (statOuts) statOuts.textContent = data.todayCheckOuts ?? 0;
    const statAbsent = document.getElementById('statAbsentCount');
    if (statAbsent) statAbsent.textContent = data.absentCount ?? 0;

    const tbody = document.getElementById('recentLogsTable');
    if (!tbody) return;
    if (!data.recentLogs || data.recentLogs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-400">${translations[currentLang].noDataYet}</td></tr>`;
      return;
    }

    const loc = currentLang === 'km' ? 'km-KH' : 'en-US';

    const slotBadgeMap = {
      morning_in: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>1/4 ព្រឹកចូល</span>`,
      lunch_out: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>2/4 សម្រាកបាយ</span>`,
      afternoon_in: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20"><span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>3/4 ចូលវិញ</span>`,
      evening_out: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>4/4 ល្ងាចចេញ</span>`,
      check_in: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Check-In</span>`,
      check_out: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20"><span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>Check-Out</span>`
    };

    tbody.innerHTML = data.recentLogs.map(l => {
      const actionBadge = slotBadgeMap[l.type] || `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">${l.type}</span>`;
      const rangeBadge = l.is_within_range 
        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>ក្នុងរង្វង់ (${l.distance_meters !== null ? l.distance_meters + 'm' : 'OK'})</span>`
        : `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>ក្រៅរង្វង់ (${l.distance_meters}m)</span>`;
      const timeStr = new Date(l.timestamp).toLocaleTimeString(loc);

      return `
        <tr class="hover:bg-cyan-500/[0.08] transition-colors border-b border-slate-800">
          <td class="py-3 px-5 font-bold text-white">${l.member_name} <span class="text-slate-400 text-[11px] font-mono">(${l.member_code})</span></td>
          <td class="py-3 px-5">${actionBadge}</td>
          <td class="py-3 px-5 font-mono text-slate-300 text-xs">${timeStr}</td>
          <td class="py-3 px-5">${rangeBadge}</td>
        </tr>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// 10. Office QR Code Poster Rendering
function renderOfficeQrPoster() {
  const container = document.getElementById('officeQrCodeDisplay');
  if (!container || !publicInfo) return;
  container.innerHTML = '';

  new QRCode(container, {
    text: publicInfo.officeQrToken || 'OFFICE-ATTENDANCE-HQ-2026',
    width: 220,
    height: 220,
    colorDark : "#0f172a",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
}

function copyMobileUrl() {
  navigator.clipboard.writeText(mobileAppUrl).then(() => {
    Swal.fire({ 
      toast: true, position: 'top-end', icon: 'success', 
      title: translations[currentLang].alertCopied, timer: 1500, showConfirmButton: false 
    });
  });
}

// 11. Admin Members Management
async function loadAdminMembers() {
  try {
    const res = await fetch('/api/members');
    allAdminMembers = await res.json();
    renderAdminMembers(allAdminMembers);
  } catch (err) {
    console.error('Failed to load members:', err);
  }
}

function renderAdminMembers(members) {
  const container = document.getElementById('adminMembersContainer');
  if (!members || members.length === 0) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-xs text-txt-muted">${translations[currentLang].noDataYet || 'រកមិនឃើញសមាជិកបុគ្គលិកទេ'}</div>`;
    return;
  }

  container.innerHTML = members.map(m => {
    const emailStr = m.email ? `<p class="text-[11px] text-slate-400 mt-0.5 truncate flex items-center gap-1"><i data-lucide="mail" class="w-3 h-3 text-slate-500 flex-shrink-0"></i>${m.email}</p>` : '';
    const pwdDisplay = m.password ? m.password : '1234';

    const avatarHtml = (m.avatar && m.avatar.trim())
      ? `<div class="w-11 h-11 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 shadow-sm"><img src="${m.avatar}" alt="${m.name}" class="w-full h-full object-cover"></div>`
      : `<div class="w-11 h-11 rounded-xl bg-slate-800 text-white font-bold flex items-center justify-center text-sm border border-white/10 flex-shrink-0">${m.name.charAt(0)}</div>`;

    return `
      <div class="p-4 sm:p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-white/10 hover:border-white/20 shadow-sm flex flex-col justify-between transition-all duration-200 group">
        <div>
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3">
              ${avatarHtml}
              <div class="min-w-0">
                <h5 class="font-bold text-white text-sm leading-snug tracking-tight truncate">${m.name}</h5>
                <div class="flex flex-wrap items-center gap-1.5 mt-1">
                  <span class="text-[10px] font-mono font-medium bg-white/5 text-slate-300 border border-white/10 px-2 py-0.5 rounded-md">${m.code}</span>
                  <span class="text-[11px] font-medium text-slate-400">${m.role || 'សមាជិក'}</span>
                </div>
                ${emailStr}
              </div>
            </div>

            <div class="flex items-center gap-1">
              <button onclick="editMember(${m.id})" class="text-slate-400 hover:text-white p-1.5 transition rounded-lg hover:bg-white/10" title="Edit / កែប្រែ">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button onclick="deleteMember(${m.id}, '${m.name.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-rose-400 p-1.5 transition rounded-lg hover:bg-rose-500/10" title="Delete / លុប">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>

          <!-- Account Credentials Chip (Masked PIN by Default with Show/Hide Eye Toggle) -->
          <div class="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
            <div class="flex items-center gap-1.5 text-slate-400">
              <i data-lucide="key" class="w-3.5 h-3.5 text-slate-500"></i>
              <span class="text-[11px]">PIN:</span>
              <code id="memberPwdText-${m.id}" data-pwd="${pwdDisplay}" class="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-white/10 tracking-widest select-all">••••</code>
              <button type="button" onclick="toggleMemberPassword(${m.id})" class="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition" title="Show / Hide PIN">
                <i id="memberPwdIcon-${m.id}" data-lucide="eye" class="w-3.5 h-3.5"></i>
              </button>
            </div>
            <span class="text-[11px] text-slate-500 font-medium">
              ${m.phone || (m.join_date ? 'ចូល: ' + m.join_date : 'Active')}
            </span>
          </div>

          <!-- 1 Device Security Lock Status & Reset -->
          <div class="mt-2.5 pt-2.5 border-t border-white/5 flex items-center justify-between text-xs">
            ${m.device_id ? `
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Device ID: ${m.device_id}">
                <i data-lucide="smartphone" class="w-3 h-3 text-emerald-400"></i>
                <span>ជាប់ទូរស័ព្ទ (1 Device Locked)</span>
              </span>
              <button type="button" onclick="resetMemberDevice(${m.id}, '${m.name.replace(/'/g, "\\'")}')" class="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 text-[11px] font-bold flex items-center gap-1 transition active:scale-95" title="ដោះសោដើម្បីឱ្យបុគ្គលិកអាចប្តូរទូរស័ព្ទថ្មីបាន">
                <i data-lucide="unlock" class="w-3 h-3"></i>
                <span>ដោះសោ</span>
              </button>
            ` : `
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 text-slate-400 border border-white/10">
                <i data-lucide="smartphone" class="w-3 h-3 text-slate-500"></i>
                <span>មិនទាន់ភ្ជាប់ទូរស័ព្ទ</span>
              </span>
              <span class="text-[10px] text-slate-500 italic">ភ្ជាប់ពេល Login ដំបូង</span>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

function toggleMemberPassword(id) {
  const el = document.getElementById('memberPwdText-' + id);
  const icon = document.getElementById('memberPwdIcon-' + id);
  if (!el) return;
  const realPwd = el.getAttribute('data-pwd');
  const isMasked = el.textContent === '••••';
  if (isMasked) {
    el.textContent = realPwd;
    el.classList.remove('tracking-widest');
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    el.textContent = '••••';
    el.classList.add('tracking-widest');
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  if (window.lucide) lucide.createIcons();
}

// ================= ADMIN PENDING APPROVAL WORKFLOW =================
async function loadPendingMembers() {
  try {
    const res = await fetch('/api/members/pending');
    if (!res.ok) return;
    allPendingMembers = await res.json();
    renderPendingMembers(allPendingMembers);
  } catch (err) {
    console.error('Failed to load pending members:', err);
  }
}

function renderPendingMembers(list) {
  const section = document.getElementById('adminPendingSection');
  const container = document.getElementById('adminPendingContainer');
  const badge = document.getElementById('pendingCountBadge');
  const navBadge = document.getElementById('admPendingNavBadge');

  const count = list ? list.length : 0;
  if (badge) badge.textContent = count + ' នាក់';
  if (navBadge) {
    if (count > 0) {
      navBadge.textContent = count;
      navBadge.classList.remove('hidden');
    } else {
      navBadge.classList.add('hidden');
    }
  }

  if (!section || !container) return;

  if (count === 0) {
    section.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');
  container.innerHTML = list.map(m => {
    const safeName = escapeHtml(m.name_km || m.name);
    const avatarHtml = (m.avatar && m.avatar.trim())
      ? `<div class="w-12 h-12 rounded-xl overflow-hidden border border-amber-400/30 flex-shrink-0 shadow-sm"><img src="${escapeHtml(m.avatar)}" alt="${safeName}" class="w-full h-full object-cover"></div>`
      : `<div class="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center text-base border border-amber-400/30 flex-shrink-0">${safeName.charAt(0)}</div>`;

    return `
      <div class="p-4 rounded-2xl bg-slate-900/90 border-2 border-amber-400/40 shadow-lg flex flex-col justify-between space-y-3">
        <div class="flex items-start gap-3">
          ${avatarHtml}
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-1">
              <h5 class="font-bold text-white text-sm truncate">${safeName}</h5>
              <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-bold">${escapeHtml(m.code)}</span>
            </div>
            ${m.name_latin ? `<p class="text-[11px] text-slate-300 mt-0.5">${escapeHtml(m.name_latin)}</p>` : ''}
            <p class="text-xs text-slate-300 mt-0.5 flex items-center gap-1 font-medium">
              <i data-lucide="briefcase" class="w-3.5 h-3.5 text-slate-400"></i>
              <span>${escapeHtml(m.role || 'សមាជិកថ្មី')}</span>
            </p>
            <p class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
              <i data-lucide="phone" class="w-3 h-3 text-slate-500"></i>
              <span>${escapeHtml(m.phone || 'គ្មានលេខ')}</span>
            </p>
            ${m.dob ? `<p class="text-[11px] text-slate-400 mt-0.5">ថ្ងៃកំណើត៖ ${escapeHtml(m.dob)}</p>` : ''}
            ${m.join_date ? `<p class="text-[11px] text-slate-400 mt-0.5">ថ្ងៃចូលធ្វើការ៖ ${escapeHtml(m.join_date)}</p>` : ''}
            <div class="mt-1.5 flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20 w-fit">
              <i data-lucide="smartphone" class="w-3 h-3"></i>
              <span>Device Locked (1 Device)</span>
            </div>
          </div>
        </div>

        <!-- Approve / Reject Actions -->
        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
          <button type="button" onclick="rejectMember(${m.id}, '${m.name.replace(/'/g, "\\'")}')" class="py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
            <span>បដិសេធ</span>
          </button>
          <button type="button" onclick="approveMember(${m.id}, '${m.name.replace(/'/g, "\\'")}')" class="py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition shadow-sm flex items-center justify-center gap-1 active:scale-95">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span>យល់ព្រម (Approve)</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function approveMember(id, name) {
  const result = await Swal.fire({
    title: 'អនុម័តបុគ្គលិក?',
    text: `តើអ្នកចង់យល់ព្រមទទួលយក "${name}" ជាបុគ្គលិកផ្លូវការមែនទេ? គាត់នឹងអាច Login និងកត់ត្រាវត្តមានលើទូរស័ព្ទនេះភ្លាមៗ។`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'យល់ព្រម (Approve)',
    cancelButtonText: 'បោះបង់',
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#64748b'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/members/${id}/approve`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      Swal.fire({ icon: 'error', title: 'បរាជ័យ', text: data.error || 'មិនអាចអនុម័តបានទេ' });
      return;
    }
    Swal.fire({
      icon: 'success',
      title: 'បានអនុម័តជោគជ័យ!',
      text: `បុគ្គលិក "${name}" អាចចាប់ផ្តើមកត់ត្រាវត្តមានបានហើយ!`,
      timer: 2000,
      showConfirmButton: false
    });
    loadAdminMembers();
    loadPendingMembers();
    if (typeof loadPublicInfo === 'function') loadPublicInfo();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function rejectMember(id, name) {
  const result = await Swal.fire({
    title: 'បដិសេធសំណើ?',
    text: `តើអ្នកប្រាកដជាចង់បដិសេធសំណើរបស់ "${name}" មែនទេ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'បដិសេធ (Reject)',
    cancelButtonText: 'បោះបង់',
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/members/${id}/reject`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      Swal.fire({ icon: 'error', title: 'បរាជ័យ', text: data.error || 'មិនអាចបដិសេធបានទេ' });
      return;
    }
    Swal.fire({
      icon: 'info',
      title: 'បានបដិសេធសំណើ',
      text: `សំណើរបស់ "${name}" ត្រូវបានលុបចេញពីបញ្ជីរង់ចាំ។`,
      timer: 1800,
      showConfirmButton: false
    });
    loadPendingMembers();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function resetMemberDevice(id, name) {
  const result = await Swal.fire({
    title: 'ដោះសោទូរស័ព្ទ?',
    text: `តើអ្នកចង់ដោះសោទូរស័ព្ទរបស់ "${name}" មែនទេ? គាត់នឹងអាចភ្ជាប់ Login ជាមួយទូរស័ព្ទថ្មីបានលើកក្រោយ។`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ដោះសោ (Unlock)',
    cancelButtonText: 'បោះបង់',
    confirmButtonColor: '#f59e0b',
    cancelButtonColor: '#64748b'
  });

  if (!result.isConfirmed) return;

  try {
    const res = await fetch(`/api/members/${id}/reset-device`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      Swal.fire({ icon: 'error', title: 'បរាជ័យ', text: data.error || 'មិនអាចដោះសោបានទេ' });
      return;
    }
    Swal.fire({
      icon: 'success',
      title: 'បានដោះសោទូរស័ព្ទជោគជ័យ!',
      text: `ទូរស័ព្ទចាស់ត្រូវបានផ្តាច់។ បុគ្គលិកអាចយកទូរស័ព្ទថ្មីមក Login បានភ្លាមៗ។`,
      timer: 2000,
      showConfirmButton: false
    });
    loadAdminMembers();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

// ================= STAFF SELF-REGISTRATION WORKFLOW =================
let selfRegAvatarBase64 = '';

function openSelfRegisterModal() {
  const modal = document.getElementById('selfRegisterModal');
  if (!modal) return;
  const form = document.getElementById('selfRegisterForm');
  if (form) form.reset();
  const pwdInput = document.getElementById('selfRegPassword');
  if (pwdInput) pwdInput.value = '1234';
  const dobInput = document.getElementById('selfRegDob');
  if (dobInput) dobInput.max = getKhDateString();
  selfRegAvatarBase64 = '';
  const preview = document.getElementById('selfRegAvatarPreview');
  if (preview) {
    preview.innerHTML = '<i data-lucide="camera" class="w-8 h-8 text-cyan-400/70"></i>';
  }
  modal.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeSelfRegisterModal() {
  const modal = document.getElementById('selfRegisterModal');
  if (modal) modal.classList.add('hidden');
}

function handleSelfRegisterAvatarSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 300;
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      selfRegAvatarBase64 = canvas.toDataURL('image/jpeg', 0.85);

      const preview = document.getElementById('selfRegAvatarPreview');
      if (preview) {
        preview.innerHTML = `<img src="${selfRegAvatarBase64}" alt="Selfie" class="w-full h-full object-cover">`;
      }
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

async function handleSelfRegisterSubmit(e) {
  e.preventDefault();
  const nameKm = (document.getElementById('selfRegNameKm').value || '').trim();
  const nameLatin = (document.getElementById('selfRegNameLatin').value || '').trim();
  const phone = (document.getElementById('selfRegPhone').value || '').trim();
  const dob = document.getElementById('selfRegDob').value;
  const joinDate = document.getElementById('selfRegJoinDate').value;
  const role = (document.getElementById('selfRegRole').value || '').trim();
  const password = (document.getElementById('selfRegPassword').value || '').trim();

  if (!nameKm || !nameLatin) {
    Swal.fire({ icon: 'warning', title: currentLang === 'km' ? 'សូមបញ្ចូលឈ្មោះខ្មែរ និងឡាតាំង' : 'Enter both Khmer and Latin names' });
    return;
  }
  if (!phone) {
    Swal.fire({ icon: 'warning', title: 'សូមបញ្ចូលលេខទូរស័ព្ទ' });
    return;
  }
  if (!dob || !joinDate || dob > getKhDateString()) {
    Swal.fire({ icon: 'warning', title: currentLang === 'km' ? 'សូមពិនិត្យថ្ងៃកំណើត និងថ្ងៃចូលធ្វើការ' : 'Check birth and employment dates' });
    return;
  }
  if (!password || password.length < 4) {
    Swal.fire({ icon: 'warning', title: 'Password ត្រូវមានយ៉ាងតិច ៤ ខ្ទង់' });
    return;
  }

  const btn = document.getElementById('btnSubmitSelfReg');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-1">⏳</span> កំពុងផ្ញើ...';
  }

  try {
    const deviceId = getOrCreateDeviceId();
    const res = await fetch('/api/members/self-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name_km: nameKm,
        name_latin: nameLatin,
        phone,
        dob,
        join_date: joinDate,
        role,
        password,
        avatar: selfRegAvatarBase64,
        device_id: deviceId
      })
    });

    const data = await res.json();
    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'ចុះឈ្មោះមិនបានសម្រេច',
        text: data.error || 'មានបញ្ហាក្នុងការចុះឈ្មោះ'
      });
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i><span>ផ្ញើសំណើចុះឈ្មោះ (Register)</span>';
        if (window.lucide) lucide.createIcons();
      }
      return;
    }

    closeSelfRegisterModal();

    Swal.fire({
      icon: 'success',
      title: 'បានផ្ញើសំណើចុះឈ្មោះជោគជ័យ!',
      html: `
        <div class="text-left text-xs space-y-2 mt-2 p-3 bg-slate-900 rounded-xl border border-white/10">
          <p>ឈ្មោះ៖ <b class="text-white">${escapeHtml(data.member.name)} (${escapeHtml(data.member.nameLatin)})</b></p>
          <p>លេខសម្គាល់ ID៖ <b class="text-cyan-400 font-mono">${data.member.code}</b></p>
          <p class="text-amber-300 font-semibold">⏳ សំណើរបស់អ្នកបានផ្ញើទៅ Telegram របស់ Admin រួចហើយ! សូមរង់ចាំ Admin ពិនិត្យនិងអនុម័ត (Approve) ទើបអាច Login បាន។</p>
          <p class="text-slate-400 text-[11px]">* ទូរស័ព្ទដៃនេះត្រូវបានចងភ្ជាប់សុវត្ថិភាព (1 Device Policy) មិនអាចប្តូរទូរស័ព្ទដោយគ្មានការអនុញ្ញាតឡើយ។</p>
        </div>
      `,
      confirmButtonText: 'យល់ព្រម',
      confirmButtonColor: '#0284c7'
    });

    // Pre-fill login input
    const loginInput = document.getElementById('loginInputCode');
    if (loginInput) loginInput.value = data.member.code;
    const pwdInput = document.getElementById('loginInputPassword');
    if (pwdInput) pwdInput.value = password;

  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i><span>ផ្ញើសំណើចុះឈ្មោះ (Register)</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

function filterAdminMembers() {
  const q = document.getElementById('adminSearchMemberInput').value.toLowerCase().trim();
  if (!q) return renderAdminMembers(allAdminMembers);
  const filtered = allAdminMembers.filter(m => 
    (m.name && m.name.toLowerCase().includes(q)) || 
    (m.code && m.code.toLowerCase().includes(q)) ||
    (m.phone && m.phone.toLowerCase().includes(q)) ||
    (m.role && m.role.toLowerCase().includes(q))
  );
  renderAdminMembers(filtered);
}

function setMemberPhotoPreview(avatarSrc, fallbackName) {
  const previewContainer = document.getElementById('memberPhotoPreview');
  const fallbackText = document.getElementById('memberPhotoFallbackText');
  const btnClear = document.getElementById('btnClearMemberPhoto');
  const hiddenInput = document.getElementById('memberFormAvatar');

  if (avatarSrc && avatarSrc.trim()) {
    hiddenInput.value = avatarSrc;
    previewContainer.innerHTML = `<img src="${avatarSrc}" alt="Avatar" class="w-full h-full object-cover">`;
    if (btnClear) btnClear.classList.remove('hidden');
  } else {
    hiddenInput.value = '';
    const initial = fallbackName ? fallbackName.trim().charAt(0) : '📷';
    previewContainer.innerHTML = `<span id="memberPhotoFallbackText">${initial}</span>`;
    if (btnClear) btnClear.classList.add('hidden');
  }
  if (window.lucide) lucide.createIcons();
}

function handleMemberPhotoSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  // Max 5MB file size
  if (file.size > 5 * 1024 * 1024) {
    Swal.fire({
      icon: 'warning',
      title: currentLang === 'km' ? 'ទំហំរូបភាពធំពេក' : 'Image too large',
      text: currentLang === 'km' ? 'សូមជ្រើសរើសរូបភាពក្រោម 5MB' : 'Please select an image smaller than 5MB'
    });
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    setMemberPhotoPreview(base64);
  };
  reader.readAsDataURL(file);
}

function clearMemberPhoto() {
  document.getElementById('memberFormPhotoInput').value = '';
  const currentName = document.getElementById('memberFormName').value;
  setMemberPhotoPreview('', currentName);
}

function openAddMemberModal() {
  document.getElementById('addMemberForm').reset();
  document.getElementById('memberFormId').value = '';
  document.getElementById('memberFormPassword').value = '1234';
  setMemberPhotoPreview('');
  const title = document.getElementById('memberModalTitle');
  if (title) title.textContent = currentLang === 'km' ? 'ចុះឈ្មោះសមាជិកបុគ្គលិកថ្មី' : 'Register New Employee';

  // Auto-generate suggestion code
  const maxId = (allAdminMembers && allAdminMembers.length) ? Math.max(...allAdminMembers.map(m => m.id || 0)) : 0;
  const nextCode = `MEM-${String(maxId + 1).padStart(3, '0')}`;
  document.getElementById('memberFormCode').value = nextCode;

  document.getElementById('addMemberModal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function editMember(id) {
  const m = allAdminMembers.find(item => item.id === id);
  if (!m) return;

  document.getElementById('memberFormId').value = m.id;
  document.getElementById('memberFormCode').value = m.code || '';
  document.getElementById('memberFormName').value = m.name || '';
  document.getElementById('memberFormRole').value = m.role || '';
  document.getElementById('memberFormPhone').value = m.phone || '';
  document.getElementById('memberFormPassword').value = m.password || '1234';
  document.getElementById('memberFormGender').value = m.gender || '';
  document.getElementById('memberFormDob').value = m.dob || '';
  document.getElementById('memberFormNationalId').value = m.national_id || '';
  document.getElementById('memberFormEmail').value = m.email || '';
  document.getElementById('memberFormAddress').value = m.address || '';
  document.getElementById('memberFormJoinDate').value = m.join_date || '';
  document.getElementById('memberFormEmergency').value = m.emergency_contact || '';
  document.getElementById('memberFormSalaryType').value = m.salary_type || 'monthly';
  document.getElementById('memberFormNotes').value = m.notes || '';
  setMemberPhotoPreview(m.avatar || '', m.name);

  const title = document.getElementById('memberModalTitle');
  if (title) title.textContent = currentLang === 'km' ? `កែប្រែព័ត៌មានបុគ្គលិក (${m.code})` : `Edit Employee (${m.code})`;

  document.getElementById('addMemberModal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeAddMemberModal() {
  document.getElementById('addMemberModal').classList.add('hidden');
}

async function handleAddMember(e) {
  e.preventDefault();
  const id = document.getElementById('memberFormId').value;
  const name = document.getElementById('memberFormName').value.trim();
  const code = document.getElementById('memberFormCode').value.trim().toUpperCase();
  const role = document.getElementById('memberFormRole').value.trim();
  const phone = document.getElementById('memberFormPhone').value.trim();
  const password = document.getElementById('memberFormPassword').value.trim();
  const gender = document.getElementById('memberFormGender').value;
  const dob = document.getElementById('memberFormDob').value;
  const national_id = document.getElementById('memberFormNationalId').value.trim();
  const email = document.getElementById('memberFormEmail').value.trim();
  const address = document.getElementById('memberFormAddress').value.trim();
  const join_date = document.getElementById('memberFormJoinDate').value;
  const emergency_contact = document.getElementById('memberFormEmergency').value.trim();
  const salary_type = document.getElementById('memberFormSalaryType').value;
  const notes = document.getElementById('memberFormNotes').value.trim();
  const avatar = document.getElementById('memberFormAvatar').value.trim();

  const payload = {
    name, code, role, phone, password,
    gender, dob, national_id, email, address, join_date, emergency_contact, salary_type, notes, avatar
  };

  try {
    const isEdit = !!id;
    const url = isEdit ? `/api/members/${id}` : '/api/members';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      Swal.fire({ icon: 'error', title: 'Error', text: data.error });
      return;
    }
    closeAddMemberModal();
    await loadAdminMembers();
    await loadPublicInfo();

    // If edited current staff, update current profile
    if (currentStaff && currentStaff.code === code) {
      const updated = allAdminMembers.find(m => m.code === code);
      if (updated) setStaffProfile(updated);
    }

    Swal.fire({ 
      icon: 'success', 
      title: isEdit ? (currentLang === 'km' ? 'បានកែប្រែទិន្នន័យជោគជ័យ' : 'Updated successfully') : (currentLang === 'km' ? 'បានចុះឈ្មោះសមាជិកជោគជ័យ' : 'Registered successfully'), 
      timer: 1500, 
      showConfirmButton: false 
    });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function deleteMember(id, name) {
  const cf = await Swal.fire({
    title: `${currentLang === 'km' ? 'លុបសមាជិក' : 'Delete Member'} "${name}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: currentLang === 'km' ? 'លុប' : 'Delete',
    cancelButtonText: currentLang === 'km' ? 'បោះបង់' : 'Cancel',
    confirmButtonColor: '#e11d48'
  });
  if (cf.isConfirmed) {
    await fetch(`/api/members/${id}`, { method: 'DELETE' });
    loadAdminMembers();
    loadPublicInfo();
  }
}

// 12. Admin History & Period Tracking (Week / Month / Day / Member)
let adminHistoryCurrentPeriod = 'week';

function setAdminHistoryPeriod(period) {
  adminHistoryCurrentPeriod = period;
  const btns = {
    'today': document.getElementById('admPeriodBtnToday'),
    'week': document.getElementById('admPeriodBtnWeek'),
    'month': document.getElementById('admPeriodBtnMonth'),
    'custom-date': document.getElementById('admPeriodBtnCustomDate'),
    'custom-month': document.getElementById('admPeriodBtnCustomMonth'),
    'all': document.getElementById('admPeriodBtnAll')
  };

  Object.keys(btns).forEach(k => {
    const btn = btns[k];
    if (!btn) return;
    if (k === period) {
      btn.className = 'adm-history-period-btn px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-xs transition';
    } else {
      btn.className = 'adm-history-period-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition';
    }
  });

  const dateInput = document.getElementById('adminHistoryDateFilter');
  const monthInput = document.getElementById('adminHistoryMonthFilter');

  if (dateInput) {
    if (period === 'custom-date') {
      dateInput.classList.remove('hidden');
      if (!dateInput.value) dateInput.value = getKhDateString();
    } else {
      dateInput.classList.add('hidden');
    }
  }

  if (monthInput) {
    if (period === 'custom-month') {
      monthInput.classList.remove('hidden');
      if (!monthInput.value) monthInput.value = getKhMonthString();
    } else {
      monthInput.classList.add('hidden');
    }
  }

  loadAttendanceHistory();
}

async function loadAttendanceHistory() {
  const memberCode = document.getElementById('adminHistoryMemberFilter') ? document.getElementById('adminHistoryMemberFilter').value : '';
  const dateVal = document.getElementById('adminHistoryDateFilter') ? document.getElementById('adminHistoryDateFilter').value : '';
  const monthVal = document.getElementById('adminHistoryMonthFilter') ? document.getElementById('adminHistoryMonthFilter').value : '';

  let queryUrl = '/api/attendance?limit=1000';
  if (memberCode) queryUrl += `&code=${encodeURIComponent(memberCode)}`;

  if (adminHistoryCurrentPeriod === 'today') {
    queryUrl += `&date=${getKhDateString()}`;
  } else if (adminHistoryCurrentPeriod === 'week') {
    const { startDate, endDate } = getKhWeekRange();
    queryUrl += `&startDate=${startDate}&endDate=${endDate}`;
  } else if (adminHistoryCurrentPeriod === 'month') {
    queryUrl += `&month=${getKhMonthString()}`;
  } else if (adminHistoryCurrentPeriod === 'custom-date') {
    if (dateVal) queryUrl += `&date=${dateVal}`;
  } else if (adminHistoryCurrentPeriod === 'custom-month') {
    if (monthVal) queryUrl += `&month=${monthVal}`;
  } // 'all': no date restriction

  try {
    const res = await fetch(queryUrl);
    const logs = await res.json();
    const tbody = document.getElementById('fullHistoryTable');
    if (!tbody) return;

    // Calculate KPIs
    const totalRecords = logs.length;
    const distinctMembers = new Set();
    let insideCount = 0;
    let outsideCount = 0;

    logs.forEach(l => {
      if (l.member_code || l.member_name) distinctMembers.add(l.member_code || l.member_name);
      if (l.is_within_range) insideCount++;
      else outsideCount++;
    });

    const inPct = totalRecords > 0 ? Math.round((insideCount / totalRecords) * 100) : 100;

    const kpiTotal = document.getElementById('admKpiTotalRecords');
    const kpiMembers = document.getElementById('admKpiActiveMembers');
    const kpiIn = document.getElementById('admKpiInGeofence');
    const kpiInPct = document.getElementById('admKpiInGeofencePct');
    const kpiOut = document.getElementById('admKpiOutGeofence');

    if (kpiTotal) kpiTotal.textContent = totalRecords;
    if (kpiMembers) kpiMembers.textContent = distinctMembers.size;
    if (kpiIn) kpiIn.textContent = insideCount;
    if (kpiInPct) kpiInPct.textContent = `${inPct}% ក្នុងទីស្នាក់ការ`;
    if (kpiOut) kpiOut.textContent = outsideCount;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400 font-medium">${translations[currentLang].noDataYet || 'មិនមានកំណត់ត្រាវត្តមានសម្រាប់កាលវេលា និងបុគ្គលិកដែលបានជ្រើសរើសនេះទេ។'}</td></tr>`;
      return;
    }

    const loc = currentLang === 'km' ? 'km-KH' : 'en-US';

    const slotBadgeMap = {
      morning_in: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>1/4 ព្រឹកចូល</span>`,
      lunch_out: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>2/4 សម្រាកបាយ</span>`,
      afternoon_in: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20"><span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>3/4 ចូលវិញ</span>`,
      evening_out: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>4/4 ល្ងាចចេញ</span>`,
      check_in: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Check-In</span>`,
      check_out: `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20"><span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>Check-Out</span>`
    };

    tbody.innerHTML = logs.map((l, i) => `
      <tr class="hover:bg-white/[0.03] transition-colors border-b border-slate-800/80">
        <td class="py-2.5 px-4 font-mono text-slate-500 text-xs">${i + 1}</td>
        <td class="py-2.5 px-4 font-bold text-white">${l.member_name || '-'}</td>
        <td class="py-2.5 px-4 font-mono text-xs text-cyan-300 font-semibold">${l.member_code || '-'}</td>
        <td class="py-2.5 px-4 text-xs text-slate-400 font-medium">${l.member_role || '-'}</td>
        <td class="py-2.5 px-4">${slotBadgeMap[l.type] || `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">${l.type}</span>`}</td>
        <td class="py-2.5 px-4 font-mono text-xs text-slate-300">${new Date(l.timestamp).toLocaleString(loc, { timeZone: 'Asia/Phnom_Penh' })}</td>
        <td class="py-2.5 px-4 font-mono text-xs text-slate-400">${l.distance_meters !== null ? l.distance_meters + 'm' : '-'}</td>
        <td class="py-2.5 px-4">${l.is_within_range 
          ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>ក្នុងរង្វង់</span>` 
          : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>ក្រៅរង្វង់</span>`}</td>
      </tr>
    `).join('');

    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error(e);
  }
}

async function exportHistoryCSV() {
  const memberCode = document.getElementById('adminHistoryMemberFilter') ? document.getElementById('adminHistoryMemberFilter').value : '';
  const dateVal = document.getElementById('adminHistoryDateFilter') ? document.getElementById('adminHistoryDateFilter').value : '';
  const monthVal = document.getElementById('adminHistoryMonthFilter') ? document.getElementById('adminHistoryMonthFilter').value : '';

  let queryUrl = '/api/attendance?limit=5000';
  if (memberCode) queryUrl += `&code=${encodeURIComponent(memberCode)}`;

  if (adminHistoryCurrentPeriod === 'today') {
    queryUrl += `&date=${getKhDateString()}`;
  } else if (adminHistoryCurrentPeriod === 'week') {
    const { startDate, endDate } = getKhWeekRange();
    queryUrl += `&startDate=${startDate}&endDate=${endDate}`;
  } else if (adminHistoryCurrentPeriod === 'month') {
    queryUrl += `&month=${getKhMonthString()}`;
  } else if (adminHistoryCurrentPeriod === 'custom-date') {
    if (dateVal) queryUrl += `&date=${dateVal}`;
  } else if (adminHistoryCurrentPeriod === 'custom-month') {
    if (monthVal) queryUrl += `&month=${monthVal}`;
  }

  const res = await fetch(queryUrl);
  const records = await res.json();
  if (!records || records.length === 0) return Swal.fire({ icon: 'info', title: 'គ្មានទិន្នន័យសម្រាប់ Export ទេ' });

  const csvRows = [['ID', 'Name', 'Code', 'Role', 'Type', 'DateTime', 'Distance (m)', 'Within Geofence', 'Note']];
  for (const r of records) {
    csvRows.push([r.id, `"${r.member_name || ''}"`, r.member_code || '', `"${r.member_role || ''}"`, r.type, `"${r.timestamp}"`, r.distance_meters || '', r.is_within_range ? 'Yes' : 'No', `"${(r.note || '').replace(/"/g, '""')}"`]);
  }
  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.map(e => e.join(",")).join("\n");
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  const periodLabel = adminHistoryCurrentPeriod;
  link.setAttribute("download", `attendance_${periodLabel}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 13. Admin Settings Load & Save
async function loadAdminSettings() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    if (s.telegram_chat_id) document.getElementById('inputTelegramChatId').value = s.telegram_chat_id;
    if (s.telegram_enabled) document.getElementById('inputTelegramEnabled').checked = s.telegram_enabled === 'true';
    if (s.company_name) document.getElementById('inputCompanyName').value = s.company_name;
    if (s.office_lat) document.getElementById('inputOfficeLat').value = s.office_lat;
    if (s.office_lng) document.getElementById('inputOfficeLng').value = s.office_lng;
    if (s.allowed_radius) document.getElementById('inputAllowedRadius').value = s.allowed_radius;
    if (s.admin_pin) document.getElementById('inputAdminPin').value = s.admin_pin;
    if (s.company_wifi_ips) {
      const el = document.getElementById('inputCompanyWifiIps');
      if (el) el.value = s.company_wifi_ips;
    }
    if (s.wifi_check_enabled !== undefined) {
      const el = document.getElementById('inputWifiCheckEnabled');
      if (el) el.checked = s.wifi_check_enabled === 'true';
    }
    if (s.telegram_leave_chat_id) {
      const el = document.getElementById('inputTelegramLeaveChatId');
      if (el) el.value = s.telegram_leave_chat_id;
    }
    if (s.telegram_leave_enabled !== undefined) {
      const el = document.getElementById('inputTelegramLeaveEnabled');
      if (el) el.checked = s.telegram_leave_enabled === 'true';
    }
  } catch (e) {
    console.error(e);
  }
}

async function saveTelegramSettings() {
  const token = document.getElementById('inputTelegramToken').value;
  const chatId = document.getElementById('inputTelegramChatId').value;
  const enabled = document.getElementById('inputTelegramEnabled').checked;

  const leaveChatIdEl = document.getElementById('inputTelegramLeaveChatId');
  const leaveEnabledEl = document.getElementById('inputTelegramLeaveEnabled');
  const leaveChatId = leaveChatIdEl ? leaveChatIdEl.value.trim() : '';
  const leaveEnabled = leaveEnabledEl ? leaveEnabledEl.checked : true;

  const payload = { 
    telegram_chat_id: chatId, 
    telegram_enabled: enabled ? 'true' : 'false',
    telegram_leave_chat_id: leaveChatId,
    telegram_leave_enabled: leaveEnabled ? 'true' : 'false'
  };
  if (token) payload.telegram_token = token;

  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  Swal.fire({ icon: 'success', title: translations[currentLang].alertSuccess, timer: 1500, showConfirmButton: false });
}

async function testTelegramConnection() {
  Swal.fire({ title: 'Testing...', didOpen: () => Swal.showLoading() });
  const res = await fetch('/api/settings/test-telegram', { method: 'POST' });
  const d = await res.json();
  if (res.ok) Swal.fire({ icon: 'success', title: translations[currentLang].alertSuccess, text: d.message });
  else Swal.fire({ icon: 'error', title: 'Error', text: d.error });
}

async function testTelegramLeaveConnection() {
  Swal.fire({ title: 'Testing Leave Group...', didOpen: () => Swal.showLoading() });
  try {
    const res = await fetch('/api/settings/test-telegram-leave', { method: 'POST' });
    const d = await res.json();
    if (res.ok) Swal.fire({ icon: 'success', title: translations[currentLang].alertSuccess, text: d.message });
    else Swal.fire({ icon: 'error', title: 'Error', text: d.error });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function saveGeofenceSettings() {
  const companyName = document.getElementById('inputCompanyName').value;
  const lat = document.getElementById('inputOfficeLat').value;
  const lng = document.getElementById('inputOfficeLng').value;
  const radius = document.getElementById('inputAllowedRadius').value;
  const pin = document.getElementById('inputAdminPin').value;
  const wifiIps = document.getElementById('inputCompanyWifiIps') ? document.getElementById('inputCompanyWifiIps').value : '';
  const wifiEnabled = document.getElementById('inputWifiCheckEnabled') ? (document.getElementById('inputWifiCheckEnabled').checked ? 'true' : 'false') : 'true';

  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      company_name: companyName, 
      office_lat: lat, 
      office_lng: lng, 
      allowed_radius: radius, 
      admin_pin: pin,
      company_wifi_ips: wifiIps,
      wifi_check_enabled: wifiEnabled
    })
  });

  await loadPublicInfo();
  Swal.fire({ icon: 'success', title: translations[currentLang].alertSuccess, timer: 1500, showConfirmButton: false });
}

function openCurrentOfficeGoogleMaps() {
  const lat = document.getElementById('inputOfficeLat').value || (publicInfo && publicInfo.officeLat);
  const lng = document.getElementById('inputOfficeLng').value || (publicInfo && publicInfo.officeLng);
  if (!lat || !lng) {
    Swal.fire({ icon: 'info', title: 'សូមបញ្ចូល Latitude និង Longitude ជាមុនសិន' });
    return;
  }
  window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
}

function detectCurrentOfficeLocation() {
  if (!navigator.geolocation) {
    Swal.fire({ icon: 'error', title: 'GPS Not Supported', text: 'Browser របស់អ្នកមិនគាំទ្រ GPS ទេ!' });
    return;
  }

  Swal.fire({
    title: currentLang === 'km' ? 'កំពុងស្វែងរកទីតាំង GPS...' : 'Detecting GPS Coordinates...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      document.getElementById('inputOfficeLat').value = lat;
      document.getElementById('inputOfficeLng').value = lng;
      Swal.fire({
        icon: 'success',
        title: currentLang === 'km' ? 'ចាប់បានទីតាំងជោគជ័យ!' : 'Location Captured!',
        html: `
          <div class="text-left bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-mono space-y-1 mt-2">
            <div>📍 <b>Latitude:</b> ${lat}</div>
            <div>📍 <b>Longitude:</b> ${lng}</div>
          </div>
          <p class="text-xs text-slate-500 mt-2">សូមចុច <b>"រក្សាទុកការកំណត់"</b> ដើម្បីអនុវត្តទីតាំងនេះ។</p>
        `,
        confirmButtonColor: '#2563EB'
      });
    },
    err => {
      Swal.fire({
        icon: 'warning',
        title: currentLang === 'km' ? 'មិនអាចចាប់ទីតាំងបានទេ' : 'GPS Permission Denied',
        text: currentLang === 'km' ? 'សូមបើកសិទ្ធិ Location Permission ក្នុង Browser របស់អ្នកជាមុនសិន។' : 'Please enable location permission in your browser.'
      });
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// 14. Trigger Daily Summary Telegram Report
async function sendDailyTelegramSummaryNow() {
  const result = await Swal.fire({
    title: currentLang === 'km' ? 'ផ្ញើរបាយការណ៍សរុបប្រចាំថ្ងៃ?' : 'Send Daily Attendance Summary?',
    text: currentLang === 'km' ? 'របាយការណ៍សរុប (វត្តមាន មកយឺត និងអវត្តមាន) នឹងត្រូវបានផ្ញើទៅកាន់ Telegram Bot ភ្លាមៗ' : 'The daily summary (present, late, absent) will be dispatched to your Telegram group immediately.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#2563EB',
    cancelButtonColor: '#64748B',
    confirmButtonText: currentLang === 'km' ? 'បាទ/ចាស ផ្ញើឥឡូវនេះ' : 'Yes, Send Now',
    cancelButtonText: currentLang === 'km' ? 'បោះបង់' : 'Cancel'
  });

  if (!result.isConfirmed) return;

  Swal.fire({
    title: currentLang === 'km' ? 'កំពុងគណនា និងផ្ញើទៅ Telegram...' : 'Generating & Sending to Telegram...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch('/api/attendance/send-daily-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const d = await res.json();

    if (res.ok) {
      const stats = d.stats || {};
      Swal.fire({
        icon: 'success',
        title: currentLang === 'km' ? 'បានផ្ញើជោគជ័យ!' : 'Dispatched Successfully!',
        html: `
          <div class="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs sm:text-sm space-y-1.5 mt-2">
            <div>👥 <b>បុគ្គលិកសរុប:</b> ${stats.total || 0} នាក់</div>
            <div>✅ <b>មានវត្តមាន:</b> ${stats.present || 0} នាក់ (ទាន់ពេល: ${stats.onTime || 0})</div>
            <div>⚠️ <b>មកយឺត (Late):</b> ${stats.late || 0} នាក់</div>
            <div>❌ <b>អវត្តមាន (Absent):</b> ${stats.absent || 0} នាក់</div>
          </div>
        `,
        confirmButtonColor: '#2563EB'
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: currentLang === 'km' ? 'មិនអាចផ្ញើបានទេ' : 'Failed to Dispatch',
        text: d.error || 'Check Telegram settings'
      });
    }
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Network Error',
      text: err.message
    });
  }
}



// ================= ACLEDA MOBILE INTERFACE & WI-FI VERIFICATION LOGIC =================
let currentNetworkStatus = null;
let isWorkHoursBlurred = false;

// Real-time Wi-Fi Network Status
async function fetchNetworkStatus(showToast = false) {
  try {
    const res = await fetch('/api/network-status');
    if (!res.ok) return;
    const data = await res.json();
    currentNetworkStatus = data;

    const badgeWrap = document.getElementById('acledaWifiBadge');
    const tileSub = document.getElementById('tileWifiSubtext');
    const tileIconWrap = document.getElementById('tileWifiIconWrap');

    if (data.isCompanyWifi) {
      if (badgeWrap) {
        badgeWrap.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-xs';
        badgeWrap.innerHTML = `<i data-lucide="wifi" class="w-3.5 h-3.5"></i> <span>${data.matchedName || 'Wi-Fi ក្រុមហ៊ុន (បានភ្ជាប់)'}</span>`;
      }
      if (tileSub) tileSub.textContent = 'បានភ្ជាប់ Wi-Fi';
      if (tileIconWrap) tileIconWrap.className = 'w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600/30 to-teal-500/20 border border-emerald-400/30 flex items-center justify-center mb-1.5 text-emerald-300';

      if (showToast) {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `បានភ្ជាប់ ${data.matchedName || 'Wi-Fi ក្រុមហ៊ុន'} រួចរាល់!`,
          text: `IP: ${data.clientIp}`,
          showConfirmButton: false,
          timer: 2500
        });
      }
    } else {
      if (badgeWrap) {
        badgeWrap.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-xs';
        badgeWrap.innerHTML = `<i data-lucide="wifi-off" class="w-3.5 h-3.5"></i> <span>មិនទាន់ភ្ជាប់ Wi-Fi ក្រុមហ៊ុន</span>`;
      }
      if (tileSub) tileSub.textContent = data.clientIp || 'ក្រៅបណ្តាញ';
      if (tileIconWrap) tileIconWrap.className = 'w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600/30 to-red-500/20 border border-rose-400/30 flex items-center justify-center mb-1.5 text-rose-300';

      if (showToast) {
        Swal.fire({
          icon: 'warning',
          title: '⚠️ មិនទាន់ភ្ជាប់ Wi-Fi ក្រុមហ៊ុន',
          html: `
            <div class="text-left text-xs space-y-2 text-slate-600">
              <p>IP បច្ចុប្បន្នរបស់អ្នក: <code class="font-bold text-amber-600">${data.clientIp || 'មិនស្គាល់'}</code></p>
              <p>ដើម្បីចុចកត់ត្រាវត្តមាន សូមភ្ជាប់ទូរស័ព្ទរបស់អ្នកទៅកាន់ <b>Wi-Fi ទី ១</b> ឬ <b>Wi-Fi ទី ២</b> របស់ក្រុមហ៊ុនជាមុនសិន។</p>
            </div>
          `,
          confirmButtonText: 'យល់ព្រម',
          confirmButtonColor: '#0ea5e9'
        });
      }
    }

    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.warn('Network status fetch error:', e);
  }
}

// 1-Click Check-in Execution (Wi-Fi Protected)
async function executeStaffCheckIn() {
  if (isSubmitting) return;

  if (!currentStaff) {
    Swal.fire({
      icon: 'info',
      title: 'សូមកំណត់ឈ្មោះជាមុនសិន',
      text: 'សូមជ្រើសរើសឈ្មោះរបស់អ្នកក្នុងប្រព័ន្ធ'
    });
    return;
  }

  if (todayScansTotalCount >= 4) {
    Swal.fire({
      icon: 'info',
      title: 'គ្រប់ 4/4 ដងរួចរាល់',
      text: 'អ្នកបានកត់ត្រាវត្តមានគ្រប់ចំនួន ៤ ដង (4/4) សម្រាប់ថ្ងៃនេះរួចរាល់ហើយ!',
      confirmButtonColor: '#0ea5e9'
    });
    return;
  }

  // 1. Strict Wi-Fi Protection Check
  if (currentNetworkStatus && currentNetworkStatus.wifiCheckEnabled && !currentNetworkStatus.isCompanyWifi) {
    Swal.fire({
      icon: 'warning',
      title: '⚠️ សូមភ្ជាប់ Wi-Fi ក្រុមហ៊ុន',
      html: `
        <div class="text-left text-xs space-y-2 text-slate-600">
          <p>ប្រព័ន្ធពិនិត្យឃើញថាអ្នកមិនទាន់បានភ្ជាប់ <b>Wi-Fi របស់ក្រុមហ៊ុន</b> ទេ។</p>
          <p class="bg-slate-100 p-2 rounded-lg font-mono text-[11px]">IP របស់អ្នកបច្ចុប្បន្ន: <b class="text-rose-600">${currentNetworkStatus.clientIp || 'មិនស្គាល់'}</b></p>
          <p class="text-slate-500">👉 សូមភ្ជាប់ទូរស័ព្ទរបស់អ្នកទៅកាន់ <b>Wi-Fi ទី១</b> ឬ <b>Wi-Fi ទី២</b> របស់ក្រុមហ៊ុន ទើបអាចចុចកត់ត្រាវត្តមានបាន!</p>
        </div>
      `,
      confirmButtonText: '🔄 ឆែក Wi-Fi ម្តងទៀត',
      showCancelButton: true,
      cancelButtonText: 'បិទ',
      confirmButtonColor: '#0ea5e9'
    }).then((res) => {
      if (res.isConfirmed) {
        fetchNetworkStatus(true);
      }
    });
    return;
  }

  isSubmitting = true;

  // 2. Cambodia Time (UTC+7) Late / Early Check
  const now = new Date();
  const cambodiaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Phnom_Penh' });
  const cambodiaDate = new Date(cambodiaStr);
  const hours = cambodiaDate.getHours();
  const minutes = cambodiaDate.getMinutes();
  const totalMins = hours * 60 + minutes;

  function formatDiffUi(mins) {
    const m = Math.abs(Math.round(mins || 0));
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h > 0) return rem > 0 ? `${h} ម៉ោង ${rem} នាទី` : `${h} ម៉ោង`;
    return `${rem} នាទី`;
  }

  let promptReason = false;
  let promptTitle = '';
  let promptSubtitle = '';

  if (currentScanAction === 'morning_in' && totalMins > 490) { // After 08:10
    const lateMins = totalMins - 480;
    promptReason = true;
    promptTitle = `⚠️ អ្នកមកយឺត ${formatDiffUi(lateMins)}`;
    promptSubtitle = 'ម៉ោងចូលធ្វើការគឺ 08:00 AM (អនុគ្រោះត្រឹម 08:10)។ សូមបញ្ជាក់មូលហេតុដែលអ្នកមកយឺត:';
  } else if (currentScanAction === 'lunch_out' && totalMins < 650) { // Before 10:50
    const earlyMins = 660 - totalMins;
    promptReason = true;
    promptTitle = `🏃💨 អ្នកចេញមុនម៉ោង ${formatDiffUi(earlyMins)}`;
    promptSubtitle = 'ម៉ោងចេញសម្រាកបាយគឺ 11:00 AM (អនុញ្ញាតចាប់ពី 10:50)។ សូមបញ្ជាក់មូលហេតុដែលអ្នកចេញមុន:';
  } else if (currentScanAction === 'afternoon_in' && totalMins > 790) { // After 13:10
    const lateMins = totalMins - 780;
    promptReason = true;
    promptTitle = `⚠️ អ្នកមកយឺត ${formatDiffUi(lateMins)}`;
    promptSubtitle = 'ម៉ោងចូលរសៀលគឺ 01:00 PM (អនុគ្រោះត្រឹម 01:10)។ សូមបញ្ជាក់មូលហេតុដែលអ្នកមកយឺត:';
  } else if (currentScanAction === 'evening_out' && totalMins < 1010) { // Before 16:50
    const earlyMins = 1020 - totalMins;
    promptReason = true;
    promptTitle = `🏃💨 អ្នកចេញមុនម៉ោង ${formatDiffUi(earlyMins)}`;
    promptSubtitle = 'ម៉ោងចេញធ្វើការគឺ 05:00 PM (អនុញ្ញាតចាប់ពី 04:50)។ សូមបញ្ជាក់មូលហេតុដែលអ្នកចេញមុន:';
  }

  let staffReason = '';
  if (promptReason) {
    const reasonResult = await Swal.fire({
      title: promptTitle,
      text: promptSubtitle,
      input: 'textarea',
      inputPlaceholder: 'ឧ. ស្ទះចរាចរណ៍, ឈឺ/មិនស្រួលខ្លួន, មានធុរៈផ្ទាល់ខ្លួន...',
      icon: 'warning',
      confirmButtonText: 'បញ្ជាក់ និងកត់ត្រាវត្តមាន',
      cancelButtonText: 'បោះបង់',
      showCancelButton: true,
      confirmButtonColor: '#f59e0b',
      cancelButtonColor: '#64748b',
      allowOutsideClick: false,
      inputValidator: (val) => {
        if (!val || !val.trim()) {
          return 'សូមបញ្ចូលមូលហេតុរបស់អ្នកជាមុនសិន!';
        }
      }
    });

    if (!reasonResult.isConfirmed) {
      isSubmitting = false;
      return;
    }
    staffReason = (reasonResult.value || '').trim();
  }

  // 3. Post One-Click Check-In to Backend
  try {
    const res = await fetch('/api/attendance/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: currentStaff.code,
        type: currentScanAction,
        check_method: 'wifi_button',
        latitude: userCoords.lat,
        longitude: userCoords.lng,
        note: staffReason,
        device_id: getOrCreateDeviceId()
      })
    });

    const data = await res.json();

    if (!res.ok) {
      Swal.fire({
        icon: 'error',
        title: 'កត់ត្រាមិនជោគជ័យ',
        text: data.error || 'មានបញ្ហាក្នុងការផ្ទៀងផ្ទាត់វត្តមាន',
        confirmButtonColor: '#f59e0b'
      });
      isSubmitting = false;
      return;
    }

    playBeep();

    const slotLabels = {
      morning_in: '🌅 1/4 ព្រឹកចូល (08:00)',
      lunch_out: '🍱 2/4 សម្រាកបាយ (11:00)',
      afternoon_in: '☕ 3/4 ចូលវិញ (13:00)',
      evening_out: '🏠 4/4 ល្ងាចចេញ (17:00)'
    };
    const slotLabel = slotLabels[data.actionType] || data.actionType;
    const initial = data.member && data.member.name ? data.member.name.trim().charAt(0).toUpperCase() : 'U';

    const reasonDisplay = data.note 
      ? `<div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-1">
          <div class="text-[10px] text-amber-300 font-bold uppercase tracking-wider">📝 មូលហេតុមកយឺត:</div>
          <div class="text-xs text-amber-100 font-medium leading-relaxed">${escapeHtml(data.note)}</div>
        </div>` 
      : '';

    const statusDisplay = data.statusText
      ? `<div class="p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between text-xs">
          <span class="text-slate-400 font-medium">ស្ថានភាពវត្តមាន:</span>
          <span class="font-bold text-white">${data.statusText}</span>
        </div>`
      : '';

    Swal.fire({
      icon: 'success',
      title: `<span class="text-base sm:text-lg font-extrabold text-white tracking-wide">${data.message || 'កត់ត្រាវត្តមានជោគជ័យ!'}</span>`,
      background: '#0f172a',
      color: '#ffffff',
      customClass: {
        popup: 'glass-crystal rounded-3xl border border-white/20 shadow-2xl p-4 sm:p-5',
        confirmButton: 'btn-gradient-primary py-2.5 px-6 rounded-xl text-xs font-bold text-white shadow-lg shadow-cyan-500/30'
      },
      html: `
        <div class="text-left space-y-3 pt-2 text-white">
          <!-- Member Profile Header -->
          <div class="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-cyan-500/25">
                ${initial}
              </div>
              <div>
                <div class="font-extrabold text-white text-xs sm:text-sm tracking-wide">${escapeHtml(data.member.name)}</div>
                <div class="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                  <span class="px-1.5 py-0.5 rounded bg-white/10 text-cyan-300">${escapeHtml(data.member.code)}</span>
                  <span>•</span>
                  <span>${escapeHtml(data.member.role || 'បុគ្គលិក')}</span>
                </div>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 font-mono font-bold text-xs shadow-xs">
              ${data.todayScansCount}/4 លើក
            </span>
          </div>

          <!-- Attendance Info Grid -->
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="p-2.5 rounded-2xl bg-white/[0.03] border border-white/10">
              <span class="text-[10px] text-slate-400 block mb-0.5">វេនវត្តមាន (Slot)</span>
              <span class="font-bold text-white text-xs">${slotLabel}</span>
            </div>
            <div class="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <span class="text-[10px] text-emerald-300 block mb-0.5">វិធីសាស្ត្រកត់ត្រា</span>
              <span class="font-bold text-emerald-400 text-xs flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>1-Click Wi-Fi</span>
              </span>
            </div>
          </div>

          ${statusDisplay}
          ${reasonDisplay}

          <!-- Telegram broadcast status -->
          <div class="p-2.5 rounded-2xl ${data.telegramSent === true ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'} border text-[11px] flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="fa-brands fa-telegram text-base"></i>
              <span class="font-medium">${data.telegramSent === true
                ? (currentLang === 'km' ? 'បានផ្ញើទៅ Telegram រួចរាល់' : 'Sent to Telegram')
                : (currentLang === 'km' ? 'វត្តមានបានកត់ត្រា ប៉ុន្តែមិនអាចបញ្ជាក់ការផ្ញើទៅ Telegram បាន។ សូមកុំចុចម្ដងទៀត។' : 'Attendance saved, but Telegram delivery was not confirmed. Please do not check in again.')}</span>
            </div>
            <span class="text-[10px] font-mono uppercase font-bold tracking-wider">${data.telegramSent === true ? 'OK' : '⚠'}</span>
          </div>
        </div>
      `,
      confirmButtonText: 'យល់ព្រម',
      confirmButtonColor: '#0ea5e9'
    });

    loadMyAttendanceActivity();
    fetchNetworkStatus();

  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'បញ្ហាប្រព័ន្ធ / អ៊ីនធឺណិត',
      text: err.message || 'មិនអាចទាក់ទងម៉ាស៊ីនបម្រើបានទេ',
      confirmButtonColor: '#f59e0b'
    });
  } finally {
    isSubmitting = false;
  }
}

// Eye Icon: Blur / Show Working Hours
function toggleWorkHoursBlur() {
  const durEl = document.getElementById('acledaWorkDurationText');
  const iconEl = document.getElementById('eyeDurationIcon');
  if (!durEl) return;
  isWorkHoursBlurred = !isWorkHoursBlurred;
  if (isWorkHoursBlurred) {
    durEl.dataset.original = durEl.textContent;
    durEl.dataset.blurred = 'true';
    durEl.textContent = '••••••••';
    durEl.classList.add('blur-sm');
    if (iconEl) iconEl.setAttribute('data-lucide', 'eye-off');
  } else {
    durEl.dataset.blurred = '';
    durEl.textContent = durEl.dataset.original || '0 ម៉ោង 0 នាទី';
    durEl.classList.remove('blur-sm');
    if (iconEl) iconEl.setAttribute('data-lucide', 'eye');
  }
  if (window.lucide) lucide.createIcons();
}

function scrollToTodayTimeline() {
  const el = document.getElementById('todayTimelineSection');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showScheduleModal() {
  Swal.fire({
    title: '🕒 កាលវិភាគបំពេញការងារ',
    html: `
      <div class="text-left text-xs sm:text-sm space-y-2.5 p-2">
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="font-bold text-slate-800">📅 ថ្ងៃធ្វើការ: ចន្ទ - សៅរិ៍</div>
          <div class="text-slate-500 text-xs mt-0.5">ថ្ងៃអាទិត្យ សម្រាកការងារ</div>
        </div>
        <div class="space-y-1.5 text-xs text-slate-700">
          <div>🌅 <b>ព្រឹកចូល:</b> 08:00 AM (អនុគ្រោះដល់ 08:10)</div>
          <div>🍱 <b>សម្រាកបាយ:</b> 11:00 AM (អនុញ្ញាតចាប់ពី 10:50)</div>
          <div>☕ <b>រសៀលចូល:</b> 01:00 PM (អនុគ្រោះដល់ 01:10)</div>
          <div>🏠 <b>ល្ងាចចេញ:</b> 05:00 PM (អនុញ្ញាតចាប់ពី 04:50)</div>
        </div>
      </div>
    `,
    confirmButtonText: 'យល់ព្រម',
    confirmButtonColor: '#0ea5e9'
  });
}

function showAcledaNoticeModal() {
  Swal.fire({
    title: '🔔 សេចក្តីជូនដំណឹង',
    html: `
      <div class="text-left text-xs space-y-2 p-2 text-slate-600">
        <p>✅ ប្រព័ន្ធវត្តមានថ្មី គាំទ្រការ <b>ចុចប៊ូតុង Check-in ផ្ទាល់</b> ដោយភ្ជាប់ Wi-Fi ក្រុមហ៊ុន។</p>
        <p>📶 Wi-Fi ក្រុមហ៊ុនដែលអនុញ្ញាត: <b>Wi-Fi ទី១</b> និង <b>Wi-Fi ទី២</b>។</p>
        <p>📊 ម្នាក់អាចកត់ត្រាបាន <b>៤ ដងក្នុងមួយថ្ងៃ</b> (ព្រឹកចូល, ចេញបាយ, ចូលវិញ, ល្ងាចចេញ)។</p>
      </div>
    `,
    confirmButtonText: 'យល់ព្រម',
    confirmButtonColor: '#0ea5e9'
  });
}

function openTelegramNoticeGroup() {
  window.open('https://t.me/c/5037746251', '_blank');
}

// ========================================================
// LEAVE & LATE PERMISSION REQUEST MODULE (V21.0)
// ========================================================
window.adminLeaveRequestsList = [];
window.currentLeaveFilter = 'all';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function parseJsonResponse(res) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Server error (${res.status})`);
    }
    return data;
  }
  const text = await res.text();
  if (res.status === 404) {
    throw new Error('ម៉ាស៊ីនបម្រើ (Server / Vercel) មិនទាន់បានធ្វើបច្ចុប្បន្នភាពកូដចុងក្រោយទេ។ សូម Upload ឬ Deploy កូដចុងក្រោយទៅកាន់ Server រួចសាកល្បងម្តងទៀត!');
  }
  if (!res.ok) {
    throw new Error(`Server Error (${res.status}): ${text.substring(0, 100)}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('ការឆ្លើយតបពីម៉ាស៊ីនបម្រើមិនត្រឹមត្រូវ (Invalid JSON)');
  }
}

function openLeaveRequestModal(defaultTab = 'leave') {
  if (!currentStaff) {
    Swal.fire({
      icon: 'warning',
      title: 'សូមចូលគណនីបុគ្គលិក',
      text: 'សូមជ្រើសរើស ឬចូលគណនីបុគ្គលិករបស់អ្នកជាមុនសិន ទើបអាចស្នើសុំច្បាប់ ឬមកយឺតបាន!',
      confirmButtonText: 'យល់ព្រម',
      confirmButtonColor: '#0ea5e9'
    });
    return;
  }

  // Populate staff profile preview
  const initial = currentStaff.name ? currentStaff.name.trim().charAt(0).toUpperCase() : 'U';
  const sName = currentStaff.name || '--';
  const sCode = currentStaff.code || '--';

  const leaveNameEl = document.getElementById('leaveStaffName');
  const leaveCodeEl = document.getElementById('leaveStaffCode');
  const leaveInitEl = document.getElementById('leaveStaffInitial');
  if (leaveNameEl) leaveNameEl.textContent = sName;
  if (leaveCodeEl) leaveCodeEl.textContent = sCode;
  if (leaveInitEl) leaveInitEl.textContent = initial;

  const lateNameEl = document.getElementById('lateStaffName');
  const lateCodeEl = document.getElementById('lateStaffCode');
  const lateInitEl = document.getElementById('lateStaffInitial');
  if (lateNameEl) lateNameEl.textContent = sName;
  if (lateCodeEl) lateCodeEl.textContent = sCode;
  if (lateInitEl) lateInitEl.textContent = initial;

  // Set default dates
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
  const leaveStart = document.getElementById('leaveStartDate');
  const leaveEnd = document.getElementById('leaveEndDate');
  const lateDate = document.getElementById('lateDate');
  if (leaveStart && !leaveStart.value) leaveStart.value = todayStr;
  if (leaveEnd && !leaveEnd.value) leaveEnd.value = todayStr;
  if (lateDate && !lateDate.value) lateDate.value = todayStr;

  updateLeaveDurationUI();
  switchLeaveModalTab(defaultTab);

  const modal = document.getElementById('leaveRequestModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  if (window.lucide) lucide.createIcons();
}

function updateLeaveDurationUI() {
  const select = document.getElementById('leaveDurationSelect');
  const endDateWrap = document.getElementById('leaveEndDateWrap');
  const startDateLabel = document.getElementById('leaveStartDateLabel');
  if (!select) return;

  const val = select.value || '';
  const isMultiple = val.includes('2 ថ្ងៃ') || val.includes('3 ថ្ងៃ') || val.includes('ច្រើនថ្ងៃ');

  if (isMultiple) {
    if (endDateWrap) endDateWrap.classList.remove('hidden');
    if (startDateLabel) startDateLabel.innerHTML = 'ចាប់ពីថ្ងៃ (Start Date) <span class="text-rose-400">*</span>';
  } else {
    if (endDateWrap) endDateWrap.classList.add('hidden');
    if (startDateLabel) startDateLabel.innerHTML = 'កាលបរិច្ឆេទ (Date) <span class="text-rose-400">*</span>';
  }
}

function setQuickLateTime(minutesToAdd) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutesToAdd);
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const formattedHours = String(hours).padStart(2, '0');
  const timeStr = `${formattedHours}:${minutes} ${ampm}`;
  const input = document.getElementById('lateExpectedTime');
  if (input) {
    input.value = timeStr;
    input.focus();
  }
}

function setExactLateTime(timeStr) {
  const input = document.getElementById('lateExpectedTime');
  if (input) {
    input.value = timeStr;
    input.focus();
  }
}

function closeLeaveRequestModal() {
  const modal = document.getElementById('leaveRequestModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function switchLeaveModalTab(tab) {
  const btnLeave = document.getElementById('leaveTabBtnLeave');
  const btnLate = document.getElementById('leaveTabBtnLate');
  const btnHistory = document.getElementById('leaveTabBtnHistory');

  const formLeave = document.getElementById('formLeaveRequest');
  const formLate = document.getElementById('formLateRequest');
  const secHistory = document.getElementById('sectionLeaveHistory');

  const activeClass = 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm font-bold';
  const inactiveClass = 'text-slate-400 font-semibold hover:text-white bg-transparent';

  [btnLeave, btnLate, btnHistory].forEach(btn => {
    if (btn) {
      btn.className = btn.className.replace(activeClass, '').replace(inactiveClass, '') + ' ' + inactiveClass;
    }
  });

  if (tab === 'leave') {
    if (btnLeave) btnLeave.className = btnLeave.className.replace(inactiveClass, '') + ' ' + activeClass;
    if (formLeave) formLeave.classList.remove('hidden');
    if (formLate) formLate.classList.add('hidden');
    if (secHistory) secHistory.classList.add('hidden');
  } else if (tab === 'late') {
    if (btnLate) btnLate.className = btnLate.className.replace(inactiveClass, '') + ' ' + activeClass;
    if (formLeave) formLeave.classList.add('hidden');
    if (formLate) formLate.classList.remove('hidden');
    if (secHistory) secHistory.classList.add('hidden');
  } else if (tab === 'history') {
    if (btnHistory) btnHistory.className = btnHistory.className.replace(inactiveClass, '') + ' ' + activeClass;
    if (formLeave) formLeave.classList.add('hidden');
    if (formLate) formLate.classList.add('hidden');
    if (secHistory) secHistory.classList.remove('hidden');
    loadMyLeaveRequests();
  }

  if (window.lucide) lucide.createIcons();
}

async function handleLeaveFormSubmit(e) {
  if (e) e.preventDefault();
  if (!currentStaff) {
    Swal.fire({ icon: 'warning', title: 'សូមចូលគណនីបុគ្គលិកជាមុនសិន' });
    return;
  }

  const btn = document.getElementById('btnSubmitLeave');
  const subType = document.getElementById('leaveSubType')?.value;
  const startDate = document.getElementById('leaveStartDate')?.value;
  const endDate = document.getElementById('leaveEndDate')?.value || startDate;
  const duration = document.getElementById('leaveDurationSelect')?.value;
  const reason = document.getElementById('leaveReason')?.value;

  if (!reason || !reason.trim()) {
    Swal.fire({ icon: 'warning', title: 'សូមបំពេញមូលហេតុ', text: 'សូមបញ្ជាក់មូលហេតុនៃការសុំច្បាប់ឱ្យបានច្បាស់លាស់!' });
    return;
  }

  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin mr-2">🌀</span> កំពុងបញ្ជូនសំណើ...`;
  }

  try {
    const payload = {
      code: currentStaff.code,
      member_id: currentStaff.id || null,
      member_name: currentStaff.name,
      member_code: currentStaff.code,
      member_role: currentStaff.role || 'បុគ្គលិក',
      request_type: 'leave',
      sub_type: subType,
      date_start: startDate,
      date_end: endDate,
      duration_text: duration,
      reason: reason.trim()
    };

    const res = await fetch('/api/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseJsonResponse(res);

    // Reset textarea
    const reasonInput = document.getElementById('leaveReason');
    if (reasonInput) reasonInput.value = '';

    await Swal.fire({
      icon: 'success',
      title: 'បានផ្ញើសំណើដោយជោគជ័យ! 🎉',
      html: `
        <div class="text-xs text-slate-300 space-y-1.5 p-1">
          <p>✅ សំណើសុំច្បាប់របស់អ្នកត្រូវបានកត់ត្រាក្នុងប្រព័ន្ធ។</p>
          <p class="text-cyan-300 font-semibold">📲 សារជូនដំណឹងត្រូវបានបញ្ជូនទៅកាន់ Group Telegram របស់ថ្នាក់ដឹកនាំរួចរាល់។</p>
          <p class="text-[11px] text-slate-400">អ្នកអាចតាមដានការឆ្លើយតបរបស់ថ្នាក់ដឹកនាំក្នុងផ្ទាំង "សំណើរបស់ខ្ញុំ"។</p>
        </div>
      `,
      confirmButtonText: 'មើលស្ថានភាពសំណើ',
      confirmButtonColor: '#0ea5e9'
    });

    switchLeaveModalTab('history');
  } catch (err) {
    console.error('Error submitting leave request:', err);
    Swal.fire({ icon: 'error', title: 'មានបញ្ហា', text: err.message });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function handleLateFormSubmit(e) {
  if (e) e.preventDefault();
  if (!currentStaff) {
    Swal.fire({ icon: 'warning', title: 'សូមចូលគណនីបុគ្គលិកជាមុនសិន' });
    return;
  }

  const btn = document.getElementById('btnSubmitLate');
  const subType = document.getElementById('lateSubType')?.value;
  const lateDate = document.getElementById('lateDate')?.value;
  const expectedTime = document.getElementById('lateExpectedTime')?.value;
  const reason = document.getElementById('lateReason')?.value;

  if (!expectedTime || !expectedTime.trim()) {
    Swal.fire({ icon: 'warning', title: 'សូមបញ្ជាក់ម៉ោង', text: 'សូមបញ្ចូលម៉ោងដែលរំពឹងថានឹងមកដល់!' });
    return;
  }

  if (!reason || !reason.trim()) {
    Swal.fire({ icon: 'warning', title: 'សូមបញ្ជាក់មូលហេតុ', text: 'សូមបញ្ជាក់មូលហេតុ ឬបញ្ហាតាមផ្លូវឱ្យបានច្បាស់លាស់!' });
    return;
  }

  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin mr-2">🌀</span> កំពុងបញ្ជូនដំណឹង...`;
  }

  try {
    const payload = {
      code: currentStaff.code,
      member_id: currentStaff.id || null,
      member_name: currentStaff.name,
      member_code: currentStaff.code,
      member_role: currentStaff.role || 'បុគ្គលិក',
      request_type: 'late',
      sub_type: subType,
      date_start: lateDate,
      date_end: lateDate,
      time_expected: expectedTime.trim(),
      duration_text: `រំពឹងមកដល់: ${expectedTime.trim()}`,
      reason: reason.trim()
    };

    const res = await fetch('/api/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseJsonResponse(res);

    // Reset textarea
    const reasonInput = document.getElementById('lateReason');
    if (reasonInput) reasonInput.value = '';

    await Swal.fire({
      icon: 'success',
      title: 'បានផ្ញើដំណឹងមកយឺតដោយជោគជ័យ! 🛵',
      html: `
        <div class="text-xs text-slate-300 space-y-1.5 p-1">
          <p>✅ ដំណឹងសុំមកយឺតត្រូវបានកត់ត្រាចូលក្នុងប្រព័ន្ធ។</p>
          <p class="text-amber-300 font-semibold">📲 សារ Alert ត្រូវបានផ្ញើជូនដំណឹងទៅ Group Telegram ថ្នាក់ដឹកនាំរួចរាល់។</p>
          <p class="text-[11px] text-slate-400">សូមបើកបរដោយសុវត្ថិភាព!</p>
        </div>
      `,
      confirmButtonText: 'យល់ព្រម',
      confirmButtonColor: '#f59e0b'
    });

    switchLeaveModalTab('history');
  } catch (err) {
    console.error('Error submitting late request:', err);
    Swal.fire({ icon: 'error', title: 'មានបញ្ហា', text: err.message });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
      if (window.lucide) lucide.createIcons();
    }
  }
}

async function loadMyLeaveRequests() {
  const container = document.getElementById('myLeaveRequestsContainer');
  if (!container) return;

  if (!currentStaff) {
    container.innerHTML = `<div class="p-4 rounded-xl bg-white/5 border border-white/10 text-center text-xs text-slate-400">សូមចូលគណនីបុគ្គលិកដើម្បីមើលប្រវត្តិសំណើ</div>`;
    return;
  }

  container.innerHTML = `<div class="py-8 text-center text-xs text-slate-400"><span class="inline-block animate-spin mr-1.5">🌀</span> កំពុងទាញយកទិន្នន័យ...</div>`;

  try {
    const res = await fetch(`/api/leave-requests/my?code=${encodeURIComponent(currentStaff.code)}`);
    const data = await parseJsonResponse(res);

    if (!data.requests || data.requests.length === 0) {
      container.innerHTML = `
        <div class="p-6 rounded-2xl bg-white/5 border border-white/10 text-center space-y-2">
          <div class="w-10 h-10 mx-auto rounded-full bg-white/10 flex items-center justify-center text-slate-400">
            <i data-lucide="clipboard-x" class="w-5 h-5"></i>
          </div>
          <p class="text-xs text-slate-300 font-medium">ពុំទាន់មានសំណើសុំច្បាប់ ឬមកយឺតនៅឡើយទេ</p>
          <p class="text-[11px] text-slate-500">រាល់សំណើដែលអ្នកបានស្នើ នឹងបង្ហាញនៅទីនេះ រួមទាំងការឆ្លើយតបពី Admin ផងដែរ</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = data.requests.map(req => {
      const isLeave = req.request_type === 'leave';
      const typeBadge = isLeave 
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-cyan-300 border border-blue-400/30">🏖️ សុំច្បាប់</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">🛵 មកយឺត</span>`;

      let statusBadge = '';
      if (req.status === 'pending') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">⏳ កំពុងរង់ចាំពិនិត្យ</span>`;
      } else if (req.status === 'approved') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">✅ បានយល់ព្រម (OK)</span>`;
      } else if (req.status === 'rejected') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">❌ មិនអនុម័ត</span>`;
      }

      let dateInfo = '';
      if (isLeave) {
        dateInfo = `📅 ${escapeHtml(req.date_start)} ${req.date_end && req.date_end !== req.date_start ? '→ ' + escapeHtml(req.date_end) : ''} • ${escapeHtml(req.duration_text || '1 ថ្ងៃ')}`;
      } else {
        dateInfo = `📅 ${escapeHtml(req.date_start)} • ⏰ មកដល់: ${escapeHtml(req.time_expected || '--')}`;
      }

      let adminResponseHtml = '';
      if (req.admin_response) {
        const isOk = req.status === 'approved';
        adminResponseHtml = `
          <div class="mt-2.5 p-2.5 rounded-xl ${isOk ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border border-rose-500/30 text-rose-200'} text-xs space-y-1">
            <div class="flex items-center justify-between font-bold text-[11px] ${isOk ? 'text-emerald-400' : 'text-rose-400'}">
              <span>💬 សារឆ្លើយតបពី Admin (ថ្នាក់ដឹកនាំ):</span>
              <span class="font-normal text-[10px] opacity-75">${req.reviewed_by || 'Admin'}</span>
            </div>
            <p class="font-medium">"${escapeHtml(req.admin_response)}"</p>
          </div>
        `;
      }

      return `
        <div class="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2 hover:border-white/20 transition">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${typeBadge}
              <span class="text-xs font-bold text-white">${escapeHtml(req.sub_type)}</span>
            </div>
            ${statusBadge}
          </div>

          <div class="text-[11px] text-cyan-300 font-mono font-medium">
            ${dateInfo}
          </div>

          <div class="text-xs text-slate-300 bg-black/30 p-2.5 rounded-xl border border-white/5">
            ${escapeHtml(req.reason)}
          </div>

          ${adminResponseHtml}

          <div class="text-[10px] text-slate-500 text-right pt-0.5">
            កាលបរិច្ឆេទស្នើ: ${new Date(req.created_at).toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' })}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Error loading my leave requests:', err);
    container.innerHTML = `<div class="p-4 text-center text-xs text-rose-400">បរាជ័យក្នុងការទាញយកទិន្នន័យ: ${err.message}</div>`;
  }
}

async function loadAdminLeaveRequests(filter = window.currentLeaveFilter || 'all') {
  const container = document.getElementById('adminLeaveRequestsContainer');
  if (container) {
    container.innerHTML = `<div class="col-span-full py-12 text-center text-xs text-slate-400"><span class="inline-block animate-spin mr-1.5">🌀</span> កំពុងទាញយកសំណើសុំច្បាប់ & មកយឺត...</div>`;
  }

  try {
    const res = await fetch('/api/leave-requests');
    const data = await parseJsonResponse(res);
    window.adminLeaveRequestsList = data.requests || [];

    // Calculate KPI stats
    const total = window.adminLeaveRequestsList.length;
    const pending = window.adminLeaveRequestsList.filter(r => r.status === 'pending').length;
    const approved = window.adminLeaveRequestsList.filter(r => r.status === 'approved').length;
    const rejected = window.adminLeaveRequestsList.filter(r => r.status === 'rejected').length;

    // Update KPI UI
    const statTotal = document.getElementById('admLeaveStatTotal');
    const statPending = document.getElementById('admLeaveStatPending');
    const statApproved = document.getElementById('admLeaveStatApproved');
    const statRejected = document.getElementById('admLeaveStatRejected');

    if (statTotal) statTotal.textContent = total;
    if (statPending) statPending.textContent = pending;
    if (statApproved) statApproved.textContent = approved;
    if (statRejected) statRejected.textContent = rejected;

    // Badges in Header & Filter
    const navBadge = document.getElementById('admPendingLeavesBadge');
    if (navBadge) {
      if (pending > 0) {
        navBadge.textContent = pending;
        navBadge.classList.remove('hidden');
      } else {
        navBadge.classList.add('hidden');
      }
    }

    const filterPendingBadge = document.getElementById('leaveFilterPendingBadge');
    if (filterPendingBadge) {
      if (pending > 0) filterPendingBadge.classList.remove('hidden');
      else filterPendingBadge.classList.add('hidden');
    }

    filterAdminLeaveRequests(filter);
  } catch (err) {
    console.error('Error loading admin leave requests:', err);
    if (container) {
      container.innerHTML = `<div class="col-span-full py-8 text-center text-xs text-rose-400">មានបញ្ហាក្នុងការទាញយកសំណើ: ${err.message}</div>`;
    }
  }
}

function filterAdminLeaveRequests(status = 'all') {
  window.currentLeaveFilter = status;

  // Update button tabs
  const btns = {
    all: document.getElementById('leaveFilterBtnAll'),
    pending: document.getElementById('leaveFilterBtnPending'),
    approved: document.getElementById('leaveFilterBtnApproved'),
    rejected: document.getElementById('leaveFilterBtnRejected')
  };

  const activeClass = 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-sm font-bold';
  const inactiveClass = 'text-slate-300 font-semibold hover:text-white bg-transparent';

  Object.entries(btns).forEach(([k, btn]) => {
    if (btn) {
      btn.className = btn.className.replace(activeClass, '').replace(inactiveClass, '') + ' ' + (k === status ? activeClass : inactiveClass);
    }
  });

  renderAdminLeaveCards(status);
}

function renderAdminLeaveCards(status = 'all') {
  const container = document.getElementById('adminLeaveRequestsContainer');
  if (!container) return;

  let list = window.adminLeaveRequestsList || [];
  if (status !== 'all') {
    list = list.filter(r => r.status === status);
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center space-y-3">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shadow-inner">
          <i data-lucide="check-circle-2" class="w-6 h-6"></i>
        </div>
        <p class="text-sm font-semibold text-slate-300">ពុំមានសំណើក្នុងប្រភេទនេះទេ</p>
        <p class="text-xs text-slate-500">រាល់សំណើសុំច្បាប់ និងមកយឺតថ្មីៗ នឹងបង្ហាញនៅទីនេះភ្លាមៗ</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = list.map(req => {
    const isLeave = req.request_type === 'leave';
    const initial = req.member_name ? req.member_name.trim().charAt(0).toUpperCase() : 'U';

    let typeBadge = isLeave
      ? `<span class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-500/20 text-cyan-300 border border-blue-400/30 flex items-center gap-1">🏖️ សុំច្បាប់</span>`
      : `<span class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">🛵 មកយឺត</span>`;

    let statusPill = '';
    if (req.status === 'pending') {
      statusPill = `<span class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 animate-pulse">⏳ រង់ចាំពិនិត្យ</span>`;
    } else if (req.status === 'approved') {
      statusPill = `<span class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">✅ បានយល់ព្រម (OK)</span>`;
    } else if (req.status === 'rejected') {
      statusPill = `<span class="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">❌ មិនអនុម័ត</span>`;
    }

    let dateDetail = '';
    if (isLeave) {
      dateDetail = `
        <div class="flex items-center gap-1.5 text-xs text-cyan-300">
          <i data-lucide="calendar" class="w-3.5 h-3.5 text-cyan-400"></i>
          <span><b>កាលបរិច្ឆេទ:</b> ${escapeHtml(req.date_start)} ${req.date_end && req.date_end !== req.date_start ? 'ដល់ ' + escapeHtml(req.date_end) : ''}</span>
          <span class="text-slate-400">(${escapeHtml(req.duration_text || '1 ថ្ងៃ')})</span>
        </div>
      `;
    } else {
      dateDetail = `
        <div class="flex items-center gap-1.5 text-xs text-amber-300">
          <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-400"></i>
          <span><b>ថ្ងៃកើតហេតុ:</b> ${escapeHtml(req.date_start)}</span>
          <span class="font-bold bg-amber-500/15 px-2 py-0.5 rounded-lg border border-amber-400/30">⏰ មកដល់: ${escapeHtml(req.time_expected || '--')}</span>
        </div>
      `;
    }

    let actionSection = '';
    if (req.status === 'pending') {
      actionSection = `
        <div class="pt-2 border-t border-white/10 flex items-center gap-2">
          <button type="button" onclick="promptReviewLeaveRequest(${req.id}, 'approved', '${escapeHtml(req.member_name)}', '${req.request_type}')" class="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
            <span>យល់ព្រម (Approve / OK)</span>
          </button>
          <button type="button" onclick="promptReviewLeaveRequest(${req.id}, 'rejected', '${escapeHtml(req.member_name)}', '${req.request_type}')" class="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 shadow-md shadow-rose-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer">
            <i data-lucide="x-circle" class="w-4 h-4"></i>
            <span>មិនអនុម័ត (Reject)</span>
          </button>
        </div>
      `;
    } else {
      const isApproved = req.status === 'approved';
      actionSection = `
        <div class="pt-2 border-t border-white/10">
          <div class="p-2.5 rounded-xl ${isApproved ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border border-rose-500/30 text-rose-200'} text-xs space-y-1">
            <div class="flex items-center justify-between font-bold text-[11px] ${isApproved ? 'text-emerald-400' : 'text-rose-400'}">
              <span>💬 សារឆ្លើយតបទៅបុគ្គលិក:</span>
              <span class="font-normal text-[10px] opacity-75">ពិនិត្យដោយ: ${escapeHtml(req.reviewed_by || 'Admin')}</span>
            </div>
            <p class="font-medium">"${escapeHtml(req.admin_response || 'គ្មានកំណត់សម្គាល់')}"</p>
          </div>
        </div>
      `;
    }

    const createdTimeStr = new Date(req.created_at).toLocaleString('km-KH', { timeZone: 'Asia/Phnom_Penh' });

    return `
      <div class="glass-crystal p-4 rounded-3xl border border-white/15 bg-slate-900/80 shadow-xl space-y-3 hover:border-white/25 transition">
        
        <!-- Header: User info + Status badge -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white font-bold flex items-center justify-center shadow-md">
              ${initial}
            </div>
            <div>
              <div class="text-sm font-extrabold text-white flex items-center gap-1.5">
                <span>${escapeHtml(req.member_name)}</span>
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-cyan-300">${escapeHtml(req.member_code)}</span>
              </div>
              <div class="text-xs text-slate-400">${escapeHtml(req.member_role || 'បុគ្គលិក')}</div>
            </div>
          </div>
          ${statusPill}
        </div>

        <!-- Type & SubType -->
        <div class="flex items-center gap-2 flex-wrap">
          ${typeBadge}
          <span class="text-xs font-bold text-slate-200">${escapeHtml(req.sub_type)}</span>
        </div>

        <!-- Date Info -->
        ${dateDetail}

        <!-- Reason -->
        <div class="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-1">
          <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">មូលហេតុនៃការស្នើសុំ:</div>
          <div class="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">${escapeHtml(req.reason)}</div>
        </div>

        <!-- Actions or Review Result -->
        ${actionSection}

        <!-- Footer: Creation Timestamp -->
        <div class="text-[10px] text-slate-500 text-right pt-1">
          កាលបរិច្ឆេទស្នើ: ${createdTimeStr}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

async function promptReviewLeaveRequest(id, status, memberName, requestType) {
  const isApproved = status === 'approved';
  const actionTitle = isApproved ? '✅ យល់ព្រមលើសំណើ (Approve / OK)' : '❌ មិនអនុម័តសំណើ (Reject)';
  const confirmBtnText = isApproved ? 'យល់ព្រម (OK)' : 'បដិសេធ (Reject)';
  const confirmBtnColor = isApproved ? '#10b981' : '#f43f5e';

  // Quick preset pills
  const presets = isApproved
    ? [
        'Okay! បានយល់ព្រម',
        'ជូនពរឱ្យឆាប់ជាសះស្បើយ!',
        'សូមបើកបរដោយប្រុងប្រយ័ត្នតាមផ្លូវ!',
        'យល់ព្រម សម្រាកឱ្យបានស្រួលបួល'
      ]
    : [
        'មិនអនុញ្ញាតព្រោះខ្វះកម្លាំងពលកម្ម',
        'សូមមកបំពេញការងារតាមការកំណត់',
        'មូលហេតុពុំទាន់គ្រប់គ្រាន់'
      ];

  const presetsHtml = presets.map((text) => `
    <button type="button" onclick="document.getElementById('swalLeaveAdminResponse').value = '${text.replace(/'/g, "\\'")}'" class="text-[11px] px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 transition cursor-pointer">
      ${text}
    </button>
  `).join('');

  const defaultText = isApproved ? 'Okay! បានយល់ព្រម' : 'មិនអនុម័ត';

  const result = await Swal.fire({
    title: actionTitle,
    html: `
      <div class="text-left text-xs space-y-3 p-1">
        <div class="p-3 rounded-xl bg-slate-800/80 border border-white/10 space-y-1">
          <div class="text-slate-300"><b>បុគ្គលិក:</b> <span class="text-white font-bold">${escapeHtml(memberName)}</span></div>
          <div class="text-slate-300"><b>ប្រភេទសំណើ:</b> <span class="text-cyan-300 font-bold">${requestType === 'leave' ? '🏖️ សុំច្បាប់ឈប់សម្រាក' : '🛵 សុំមកយឺត'}</span></div>
        </div>

        <div>
          <label class="block font-semibold text-slate-300 mb-1">
            សារឆ្លើយតបទៅកាន់បុគ្គលិក និង Telegram:
          </label>
          <textarea id="swalLeaveAdminResponse" rows="2" class="w-full text-xs bg-slate-900 border border-white/20 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-400" placeholder="បញ្ចូលសារឆ្លើយតប...">${defaultText}</textarea>
        </div>

        <div>
          <div class="text-[11px] text-slate-400 mb-1.5 font-semibold">ចុចជ្រើសរើសសារគំរូយ៉ាងរហ័ស:</div>
          <div class="flex flex-wrap gap-1.5">
            ${presetsHtml}
          </div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: confirmBtnText,
    cancelButtonText: 'ត្រឡប់ក្រោយ',
    confirmButtonColor: confirmBtnColor,
    cancelButtonColor: '#64748b',
    preConfirm: () => {
      const input = document.getElementById('swalLeaveAdminResponse');
      return input ? input.value.trim() : defaultText;
    }
  });

  if (!result.isConfirmed) return;

  const adminResponse = result.value || defaultText;

  Swal.fire({
    title: 'កំពុងកត់ត្រាការសម្រេច...',
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await fetch(`/api/leave-requests/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        admin_response: adminResponse,
        reviewed_by: 'Admin'
      })
    });

    const data = await parseJsonResponse(res);

    await Swal.fire({
      icon: 'success',
      title: 'ជោគជ័យ! 🎉',
      html: `
        <div class="text-xs text-slate-300 space-y-1">
          <p>${data.message}</p>
          <p class="text-cyan-300 font-semibold">📲 ការសម្រេចនេះត្រូវបានផ្ញើទៅកាន់ Telegram និងឆ្លុះបញ្ចាំងលើគណនីបុគ្គលិកភ្លាមៗ!</p>
        </div>
      `,
      confirmButtonText: 'យល់ព្រម',
      confirmButtonColor: '#0ea5e9'
    });

    loadAdminLeaveRequests(window.currentLeaveFilter || 'all');
  } catch (err) {
    console.error('Error reviewing leave request:', err);
    Swal.fire({ icon: 'error', title: 'មានបញ្ហា', text: err.message });
  }
}

