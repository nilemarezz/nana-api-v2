import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const { NANA_SHEET, CLIENT_EMAIL, PRIVATE_KEY } = process.env;

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export async function createGoogleSheetConnection() {
  const auth = new google.auth.JWT(
    CLIENT_EMAIL,
    null,
    PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets"]
  );

  const sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

// get al data by sheet title
export async function getSheetDataByTitle(sheets, title) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: NANA_SHEET,
    range: title,
  });

  return response.data.values;
}

export async function getDataByAccount(sheets, title, account) {
  const data = await getSheetDataByTitle(sheets, title);
  const result = data.filter(
    (item) =>
      item[1].replace(/\s+/g, "").toLowerCase() ===
      account.replace(/\s+/g, "").toLowerCase()
  );

  // each item in result has to by an array of 19, if not add null to the array
  result.forEach((item) => {
    if (item.length < 19) {
      const diff = 19 - item.length;
      for (let i = 0; i < diff; i++) {
        item.push(null);
      }
    }
  });

  return result.map(mappedResult);
}

const mappedResult = (row, i) => {
  return {
    Timestamp: row[0] || null, //Timestamp
    "@Twitter": row[1] || null, //Twitter
    id: i, // id
    product_name: row[2] || null, // รายการสั่งซื้อ
    product_detail: row[3] || null, // หมายเหตุสินค้า
    amount: row[4] || null, // รวมจำนวนกี่ชิ้น/เซ็ต
    product_pay: row[5] || null, // รวมราคา
    payment_method: row[6] || null, // เต็มจำนวน/มัดจำ
    paid: row[7] || null, // จ่ายแล้ว
    total2: row[8] || null, // คงเหลือ
    paid_date: row[9] || null, // จ่ายที่เหลือภายในวันที่
    release_date: row[10] || null, // เว็บจัดส่งภายในวันที่
    shipping_method: row[11] || null, // ขนส่ง
    product_status: row[13] || null, // กดสั่งซื้อ
    tracking_no: row[16] || null, // เลข Tracking
    image:
      row[18] == null || row[18] == ""
        ? null
        : row[18].split(",").map((item) => item.trim()), // รูป
    release_date_format:
      row[10] !== ""
        ? `${monthNames[new Date(row[10]).getMonth()]} ${new Date(
            row[10]
          ).getFullYear()}`
        : "TBA",
    release_date_compare:
      row[10] == "" ? Date.parse("2060-01-01") : Date.parse(row[10]),
    success: true,
  };
};

export async function insertNewRecord(sheets, title, newRows) {
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: NANA_SHEET,
    range: title,
    valueInputOption: "RAW",
    resource: {
      values: newRows,
    },
  });

  return response.status === 200;
}
