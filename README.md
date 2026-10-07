# ប្រព័ន្ធស្រង់វត្តមានឌីជីថល (Digital Attendance Hub)
> បង្កើតឡើងដោយ Node.js, Express, SQLite, HTML5 QR Scanner និង Telegram Bot API

## មុខងារសំខាន់ៗ (Features)
1. **គ្រប់គ្រងសមាជិក (Members Management):** បន្ថែម លុប ស្វែងរក និងបង្កើត QR Code Badge សម្រាប់សមាជិកម្នាក់ៗ (អាច Save/Print បាន)។
2. **ស្កេនវត្តមាន (QR Code Scanner):** ស្កេនកាមេរ៉ាផ្ទាល់ (ទូរស័ព្ទ ឬកុំព្យូទ័រ) និងមានមុខងារជ្រើសរើសដោយដៃ (Manual Input)។
3. **កំណត់ទីតាំងច្បាស់លាស់ (GPS Geofencing):** គណនាចម្ងាយរវាងទូរស័ព្ទបុគ្គលិក និងការិយាល័យដោយប្រើ Haversine Formula (ដឹងច្បាស់ថាបុគ្គលិកនៅ ឬក្រៅការិយាល័យ)។
4. **ផ្ញើសារជូនដំណឹងទៅ Telegram ភ្លាមៗ (Telegram Bot Alert):** រាល់ពេលស្កេន Check-In / Check-Out ជោគជ័យ ប្រព័ន្ធនឹងផ្ញើសារលម្អិតចូល Telegram Group ឬ Channel ស្វ័យប្រវត្តិ។
5. **ផ្ទាំងគ្រប់គ្រង & របាយការណ៍ (Dashboard & Export):** បង្ហាញស្ថិតិសមាជិកវត្តមានថ្ងៃនេះ និងអាចទាញយកទិន្នន័យជាឯកសារ Excel/CSV បាន។

## របៀបដំណើរការ (How to Run)
```bash
# ចូលទៅកាន់ Folder គម្រោង
cd "D:\attendance-webapp"

# បើកដំណើរការ Server
node server.js
```
រួចបើក Browser ចូលទៅកាន់: **http://localhost:3000**

## របៀប Setup Telegram Bot ក្នុង App
1. បើក Telegram ស្វែងរក **@BotFather** -> វាយ `/newbot` -> យក **Bot Token**
2. បង្កើត Group ក្នុង Telegram រួច Add Bot ចូល
3. យក **Chat ID** របស់ Group (ឧទាហរណ៍ Add `@raw_data_bot` ចូលដើម្បីមើល Chat ID)
4. ចូលទៅកាន់ Menu **"ការកំណត់ & Telegram"** លើ Web App រួចបញ្ចូល Token និង Chat ID រួចចុច "តេស្តផ្ញើសារ"។
