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
const RETRY_ATTEMPTS = 3;            // จำนวนครั้งที่จะพยายามเชื่อมต่อใหม่
const RETRY_DELAY = 5000;            // หน่วงเวลาก่อนลองใหม่ (มิลลิวินาที)

// ========================================
// 💻 ส่วนโค้ดหลัก - ห้ามแก้ไข
// ========================================

// สร้าง URL สำหรับเรียกข้อมูล
const SHEETS_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SUMMARY_SHEET}?key=${API_KEY}`;
const BANK_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(BANK_SHEET)}?key=${API_KEY}`;
const SCHOOL_API_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SCHOOL_SHEET)}?key=${API_KEY}`;

// เก็บสถานะการเชื่อมต่อและข้อมูลสำรอง
let connectionStatus = 'connecting';
let lastSuccessfulUpdate = null;
let retryCount = 0;

// ฟังก์ชันสำหรับบันทึกและโหลดข้อมูลจาก localStorage
function saveDataToCache(key, data) {
  try {
    localStorage.setItem(`kathin_${key}`, JSON.stringify({
      data: data,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.warn('ไม่สามารถบันทึกข้อมูลลงแคชได้:', error);
  }
}

function loadDataFromCache(key, maxAge = 24 * 60 * 60 * 1000) { // 24 ชั่วโมง
  try {
    const cached = localStorage.getItem(`kathin_${key}`);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp > maxAge) {
      localStorage.removeItem(`kathin_${key}`);
      return null;
    }
    
    return parsed.data;
  } catch (error) {
    console.warn('ไม่สามารถโหลดข้อมูลจากแคชได้:', error);
    return null;
  }
}

function parseAmount(amountText) {
  if (!amountText) return 0;
  const cleaned = amountText.toString().replace(/[฿,\s]/g, '');
  if (cleaned === '-' || isNaN(cleaned)) return 0;
  return parseFloat(cleaned) || 0;
}

async function fetchDataFromGoogleSheets(attempt = 1) {
  try {
    updateSystemStatus('กำลังเชื่อมต่อ...');
    
    const response = await fetch(SHEETS_API_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    
    if (data.values && data.values.length > 0) {
      // บันทึกข้อมูลลงแคช
      saveDataToCache('summary_data', data.values);
      
      updateAmounts(data.values);
      updateLastUpdateTime();
      connectionStatus = 'connected';
      retryCount = 0;
      lastSuccessfulUpdate = Date.now();
      updateSystemStatus('เชื่อมต่อสำเร็จ');
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    
    if (attempt < RETRY_ATTEMPTS) {
      updateSystemStatus(`กำลังลองใหม่ครั้งที่ ${attempt}/${RETRY_ATTEMPTS}...`);
      setTimeout(() => {
        fetchDataFromGoogleSheets(attempt + 1);
      }, RETRY_DELAY);
      return;
    }
    
    // หากล้มเหลวทั้งหมด ลองใช้ข้อมูลจากแคช
    const cachedData = loadDataFromCache('summary_data');
    if (cachedData) {
      updateAmounts(cachedData);
      updateSystemStatus('ใช้ข้อมูลสำรอง (ออฟไลน์)');
      connectionStatus = 'offline';
    } else {
      updateSystemStatus('❌ ไม่สามารถเชื่อมต่อข้อมูลได้');
      connectionStatus = 'error';
    }
    
    retryCount++;
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

function updateSystemStatus(message) {
  const indicator = document.getElementById('loading-indicator');
  const statusIcon = connectionStatus === 'connected' ? '✅' : 
                    connectionStatus === 'offline' ? '📴' : 
                    connectionStatus === 'error' ? '❌' : '🔄';
  
  indicator.innerHTML = `<span>${statusIcon} ${message}</span>`;
}

let marqueeGroups = [];
let currentGroupIndex = 0;

async function fetchAllMarqueeGroups(attempt = 1) {
  try {
    const [bankRes, schoolRes] = await Promise.all([
      fetch(BANK_API_URL),
      fetch(SCHOOL_API_URL)
    ]);
    
    if (!bankRes.ok || !schoolRes.ok) {
      throw new Error(`HTTP error! Bank: ${bankRes.status}, School: ${schoolRes.status}`);
    }
    
    const bankData = await bankRes.json();
    const schoolData = await schoolRes.json();

    // บันทึกข้อมูลลงแคช
    saveDataToCache('bank_data', bankData);
    saveDataToCache('school_data', schoolData);

    processMarqueeData(bankData, schoolData);
  } catch (error) {
    console.error('Error fetching marquee data:', error);
    
    if (attempt < RETRY_ATTEMPTS) {
      setTimeout(() => {
        fetchAllMarqueeGroups(attempt + 1);
      }, RETRY_DELAY);
      return;
    }
    
    // ใช้ข้อมูลจากแคช
    const cachedBankData = loadDataFromCache('bank_data');
    const cachedSchoolData = loadDataFromCache('school_data');
    
    if (cachedBankData || cachedSchoolData) {
      processMarqueeData(cachedBankData || {}, cachedSchoolData || {});
    } else {
      document.querySelector('.marquee').innerHTML = '<div style="color:#ff6b6b;">❌ ไม่สามารถโหลดข้อมูลรายชื่อได้</div>';
    }
  }
}

function processMarqueeData(bankData, schoolData) {
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

// ฟังก์ชันสำหรับบันทึกข้อมูลทั้งหมดเป็นไฟล์
function exportBackupData() {
  const backupData = {
    timestamp: new Date().toISOString(),
    summary: loadDataFromCache('summary_data'),
    bank: loadDataFromCache('bank_data'),
    school: loadDataFromCache('school_data'),
    settings: {
      spreadsheetId: SPREADSHEET_ID,
      updateInterval: UPDATE_INTERVAL,
      marqueeDuration: MARQUEE_DURATION
    }
  };
  
  const dataStr = JSON.stringify(backupData, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kathin-backup-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// ฟังก์ชันสำหรับโหลดข้อมูลจากไฟล์สำรอง
function importBackupData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backupData = JSON.parse(e.target.result);
      
      if (backupData.summary) {
        saveDataToCache('summary_data', backupData.summary);
        updateAmounts(backupData.summary);
      }
      
      if (backupData.bank || backupData.school) {
        saveDataToCache('bank_data', backupData.bank || {});
        saveDataToCache('school_data', backupData.school || {});
        processMarqueeData(backupData.bank || {}, backupData.school || {});
      }
      
      updateSystemStatus('โหลดข้อมูลสำรองสำเร็จ');
      updateLastUpdateTime();
    } catch (error) {
      alert('ไม่สามารถโหลดไฟล์สำรองได้: ' + error.message);
    }
  };
  reader.readAsText(file);
}

function init() {
  // โหลดข้อมูลจากแคชก่อน (ถ้ามี)
  const cachedSummary = loadDataFromCache('summary_data');
  if (cachedSummary) {
    updateAmounts(cachedSummary);
    updateSystemStatus('ใช้ข้อมูลสำรอง');
  }
  
  const cachedBank = loadDataFromCache('bank_data');
  const cachedSchool = loadDataFromCache('school_data');
  if (cachedBank || cachedSchool) {
    processMarqueeData(cachedBank || {}, cachedSchool || {});
  }
  
  // จากนั้นเรียกข้อมูลใหม่
  fetchDataFromGoogleSheets();
  fetchAllMarqueeGroups();
  
  // ตั้งค่า interval สำหรับอัปเดตอัตโนมัติ
  setInterval(fetchDataFromGoogleSheets, UPDATE_INTERVAL * 1000);
  setInterval(fetchAllMarqueeGroups, UPDATE_INTERVAL * 1000);
  
  // เพิ่มปุ่มสำหรับการจัดการข้อมูล
  addManagementButtons();
}

function addManagementButtons() {
  // สร้างปุ่มควบคุมระบบ
  const controlPanel = document.createElement('div');
  controlPanel.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    z-index: 9999;
    display: flex;
    gap: 5px;
    opacity: 0.7;
    transition: opacity 0.3s;
  `;
  
  controlPanel.onmouseenter = () => controlPanel.style.opacity = '1';
  controlPanel.onmouseleave = () => controlPanel.style.opacity = '0.7';
  
  // ปุ่มบันทึกข้อมูล
  const saveBtn = document.createElement('button');
  saveBtn.innerHTML = '💾';
  saveBtn.title = 'บันทึกข้อมูลสำรอง';
  saveBtn.onclick = exportBackupData;
  saveBtn.style.cssText = buttonStyle;
  
  // ปุ่มโหลดข้อมูล
  const loadBtn = document.createElement('button');
  loadBtn.innerHTML = '📁';
  loadBtn.title = 'โหลดข้อมูลสำรอง';
  loadBtn.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = importBackupData;
    input.click();
  };
  loadBtn.style.cssText = buttonStyle;
  
  // ปุ่มรีเฟรช
  const refreshBtn = document.createElement('button');
  refreshBtn.innerHTML = '🔄';
  refreshBtn.title = 'รีเฟรชข้อมูล';
  refreshBtn.onclick = () => {
    fetchDataFromGoogleSheets();
    fetchAllMarqueeGroups();
  };
  refreshBtn.style.cssText = buttonStyle;
  
  controlPanel.appendChild(saveBtn);
  controlPanel.appendChild(loadBtn);
  controlPanel.appendChild(refreshBtn);
  document.body.appendChild(controlPanel);
}

const buttonStyle = `
  background: rgba(0,0,0,0.7);
  border: none;
  color: white;
  padding: 8px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
`;

document.addEventListener('DOMContentLoaded', init);
window.manualUpdate = fetchDataFromGoogleSheets;
window.exportBackup = exportBackupData;