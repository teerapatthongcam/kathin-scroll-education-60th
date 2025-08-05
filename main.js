// ========================================
// 🔧 ส่วนตั้งค่า - แก้ไขเฉพาะส่วนนี้
// ========================================

// ⚠️ สำคัญ: ให้แก้ไขเฉพาะ 2 ค่านี้เท่านั้น
const SPREADSHEET_ID = '1MAj8VCJSx46Z1XYfvKpF7vm6Yr0gx3_c1KKbc57Hbfs'; // 📝 ใส่ ID ของ Google Sheets ของคุณ
const API_KEY = 'AIzaSyDxTCnWAV0-sS2EE7r7E7WIza3B9zVwfM0';           // 🔑 ใส่ API Key ของคุณ

// 📋 ชื่อชีทใน Google Sheets (ถ้าต้องการเปลี่ยน)
const SUMMARY_SHEET = 'A1:J7';                    // ชีทสรุปยอดเงิน
const BANK_SHEET = 'บัญชีทอดผ้าป่าฯ!B:D';         // ชีทบัญชีทอดผ้าป่า
const SCHOOL_SHEET = 'บัญชีรายได้สถานศึกษา!B:D';   // ชีทบัญชีรายได้สถานศึกษา

// ⏱️ การตั้งค่าเวลา (หน่วยเป็นวินาที)
const UPDATE_INTERVAL = 10 * 60;     // อัปเดตข้อมูลทุก 10 นาที
const MARQUEE_DURATION = 180;        // แสดงข้อมูลแต่ละกลุ่ม 3 นาที (180 วินาที)

// ========================================
// 💻 ส่วนโค้ดหลัก - ห้ามแก้ไข
// ========================================

// สร้าง URL สำหรับเรียกข้อมูล
const SHEETS_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SUMMARY_SHEET}?key=${API_KEY}`;
const BANK_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(BANK_SHEET)}?key=${API_KEY}`;
const SCHOOL_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SCHOOL_SHEET)}?key=${API_KEY}`;

function parseAmount(amountText) {
  if (!amountText) return 0;
  const cleaned = amountText.toString().replace(/[฿,\s]/g, '');
  if (cleaned === '-' || isNaN(cleaned)) return 0;
  return parseFloat(cleaned) || 0;
}

async function fetchDataFromGoogleSheets() {
  try {
    const response = await fetch(SHEETS_API_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    if (data.values && data.values.length > 0) {
      updateAmounts(data.values);
      updateLastUpdateTime();
    }
  } catch (error) {
    document.getElementById('loading-indicator').innerHTML =
      '<span style="color: #ff6b6b;">❌ ไม่สามารถเชื่อมต่อข้อมูลได้</span>';
  }
}

function updateAmounts(data) {
  let donationAmount = 0;
  let amuletAmount = 0;
  let totalAmount = 0;

  for (let j = 0; j < data[3].length; j++) {
    if (data[3][j] && data[3][j].includes("เงินบริจาค")) {
      donationAmount = parseAmount(data[4][j]);
    }
    if (data[3][j] && data[3][j].includes("สั่งจองพระเครื่อง")) {
      amuletAmount = parseAmount(data[4][j]);
    }
  }

  for (let j = 0; j < data[3].length; j++) {
    if (data[3][j] && data[3][j].includes("ยอดเงินทั้งหมด")) {
      if (data[3][j - 1]) totalAmount = parseAmount(data[3][j - 1]);
      else if (data[3][j + 1]) totalAmount = parseAmount(data[3][j + 1]);
    }
  }

  if (totalAmount === 0) {
    for (let j = 0; j < data[1].length; j++) {
      if (data[1][j] && data[1][j].includes("ยอดเงินทั้งหมด")) {
        if (data[1][j - 1]) totalAmount = parseAmount(data[1][j - 1]);
        else if (data[1][j + 1]) totalAmount = parseAmount(data[1][j + 1]);
      }
    }
  }

  if (totalAmount === 0) {
    totalAmount = donationAmount + amuletAmount;
  }

  // Remove loading class and update values
  document.getElementById('donation-amount').classList.remove('loading');
  document.getElementById('amulet-amount').classList.remove('loading');
  document.getElementById('total-amount').classList.remove('loading');

  document.getElementById('donation-amount').textContent = `${donationAmount.toLocaleString()} บาท`;
  document.getElementById('amulet-amount').textContent = `${amuletAmount.toLocaleString()} บาท`;
  document.getElementById('total-amount').textContent = `${totalAmount.toLocaleString()} บาท`;
}

function updateLastUpdateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  document.getElementById('last-update').textContent = timeString;
}

let marqueeGroups = [];
let currentGroupIndex = 0;

async function fetchAllMarqueeGroups() {
  try {
    const [bankRes, schoolRes] = await Promise.all([
      fetch(BANK_API_URL),
      fetch(SCHOOL_API_URL)
    ]);
    const bankData = await bankRes.json();
    const schoolData = await schoolRes.json();

    marqueeGroups = [];

    // --- โอนเข้าบัญชีทอดผ้าป่าฯ (เริ่มต้น) ---
    if (bankData.values && bankData.values.length > 1) {
      let startIdx = 0;
      if (bankData.values[0][1] && bankData.values[0][1].includes("เลขที่ใบเสร็จ")) startIdx = 1;
      // เรียงลำดับเงินมากไปน้อย
      const rows = bankData.values.slice(startIdx).filter(row => row[0] && row[2]);
      rows.sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));
      let html = `<div class="category-header">🏦 โอนเข้าบัญชีทอดผ้าป่าฯ</div>`;
      for (const row of rows) {
        html += `<div class="donor-item">
          <span class="donor-name">${row[0]}</span>
          <span class="donor-amount">${parseInt(row[2]).toLocaleString()} บาท</span>
        </div>`;
      }
      marqueeGroups.push(html);
    }

    // --- โอนเข้าบัญชีรายได้สถานศึกษา ---
    if (schoolData.values && schoolData.values.length > 1) {
      let startIdx = 0;
      if (schoolData.values[0][1] && schoolData.values[0][1].includes("เลขที่ใบเสร็จ")) startIdx = 1;
      const rows = schoolData.values.slice(startIdx).filter(row => row[0] && row[2]);
      rows.sort((a, b) => parseFloat(b[2]) - parseFloat(a[2]));
      let html = `<div class="category-header">🎓 โอนเข้าบัญชีรายได้สถานศึกษา</div>`;
      for (const row of rows) {
        html += `<div class="donor-item">
          <span class="donor-name">${row[0]}</span>
          <span class="donor-amount">${parseInt(row[2]).toLocaleString()} บาท</span>
        </div>`;
      }
      marqueeGroups.push(html);
    }

    currentGroupIndex = 0;
    showCurrentMarqueeGroup();
  } catch (error) {
    document.querySelector('.marquee').innerHTML = '<div style="color:#ff6b6b;">❌ ไม่สามารถโหลดข้อมูลรายชื่อทั้งหมดได้</div>';
  }
}

function showCurrentMarqueeGroup() {
  const marquee = document.querySelector('.marquee');
  if (!marqueeGroups.length) {
    marquee.innerHTML = '<div style="color:#ff6b6b;">❌ ไม่มีข้อมูลแสดงผล</div>';
    return;
  }
  marquee.innerHTML = marqueeGroups[currentGroupIndex];

  marquee.style.animation = 'none';
  void marquee.offsetWidth;
  marquee.style.animation = null;

  setTimeout(() => {
    currentGroupIndex = (currentGroupIndex + 1) % marqueeGroups.length;
    showCurrentMarqueeGroup();
  }, MARQUEE_DURATION * 1000);
}

function init() {
  fetchDataFromGoogleSheets();
  fetchAllMarqueeGroups();
  setInterval(fetchDataFromGoogleSheets, UPDATE_INTERVAL * 1000);
  setInterval(fetchAllMarqueeGroups, UPDATE_INTERVAL * 1000);
}

document.addEventListener('DOMContentLoaded', init);
window.manualUpdate = fetchDataFromGoogleSheets;