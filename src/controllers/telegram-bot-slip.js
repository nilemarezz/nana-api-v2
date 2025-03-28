import axios from "axios";
import Jimp from "jimp";
import QrCodeReader from "qrcode-reader";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import FormData from "form-data";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOAD_FOLDER = path.join(__dirname, "downloads");

// Ensure the download folder exists
if (!fs.existsSync(DOWNLOAD_FOLDER)) {
  fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true });
}

const { TELEGRAM_BOT_TOKEN, EASY_SLIP_TOKEN } = process.env;

const BOT_TOKEN = TELEGRAM_BOT_TOKEN; // Replace with your bot token
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function SlipCheckController(request, reply) {
  const update = request.body;

  if (update.message && update.message.photo) {
    // Step 1: Extract image details
    const chatId = update.message.chat.id;
    const messageId = update.message.message_id;
    const fileId =
      update.message.photo[update.message.photo.length - 1].file_id;

    // Step 2: Get file URL from Telegram
    const fileUrl = await getFileUrl(fileId);

    if (fileUrl) {
      // Step 3: Download image
      const imageBuffer = await downloadImage(fileUrl);

      // get image by base64
      // const imageBuffer = Buffer.from(update.message.photo[update.message.photo.length - 1].file_id, "base64");

      // Step 4: Read QR code from the image
      try {
        let qrCodeData = await readQRCode(imageBuffer);
        console.log("QR Code Data:", qrCodeData);

        const checkSlipData = await checkSlip(qrCodeData);
        await checkSlipResponse(checkSlipData, chatId, messageId);
      } catch (e) {
        const savedFilePath = await downloadTelegramFile(fileId);
        console.log(`File saved at: ${savedFilePath}`);

        // send data via file to checkSlip
        const checkSlipData = await checkSlipByImage(savedFilePath);
        await checkSlipResponse(checkSlipData, chatId, messageId);
        reply.send({ status: "ok" });
      }
    }

    reply.send({ status: "ok" });
  }
  // Function to get the file URL from Telegram API
  async function getFileUrl(fileId) {
    const response = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    if (response.data.ok) {
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${response.data.result.file_path}`;
    }
    return null;
  }

  // Function to download image using axios
  async function downloadImage(url) {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(response.data, "binary");
  }

  // Function to read QR code from image buffer
  async function readQRCode(imageBuffer) {
    return new Promise((resolve, reject) => {
      Jimp.read(imageBuffer, (err, image) => {
        if (err) {
          return reject(err);
        }

        const qrCode = new QrCodeReader();
        qrCode.callback = (error, value) => {
          if (error) {
            reject("QR Code could not be read");
          } else {
            resolve(value.result);
          }
        };
        qrCode.decode(image.bitmap);
      });
    });
  }

  // Function to add reaction to a message
  async function addReaction(chatId, messageId, emoji) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/setMessageReaction`,
        {
          chat_id: chatId,
          message_id: messageId,
          reaction: [{ type: "emoji", emoji: emoji }],
        }
      );
      console.log(`✅ Added reaction ${emoji} to message ${messageId}`);
    } catch (error) {
      console.error(
        "❌ Failed to add reaction:",
        error.response?.data || error.message
      );
    }
  }

  // Function to send a message to Telegram chat
  async function sendMessage(chatId, text) {
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown",
      });
      console.log(`✅ Sent message: "${text}"`);
    } catch (error) {
      console.error(
        "❌ Failed to send message:",
        error.response?.data || error.message
      );
    }
  }

  async function checkSlip(payload) {
    console.log("check slip by qr code");
    try {
      const { data } = await axios.get(
        "https://developer.easyslip.com/api/v1/verify",
        {
          params: {
            payload: payload,
          },
          headers: {
            Authorization: `Bearer ${EASY_SLIP_TOKEN}`,
          },
        }
      );

      return data;
    } catch (error) {
      return error.response.data;
    }
  }

  async function checkSlipByImage(filePath) {
    console.log("check slip by image");
    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(filePath));

      const { data } = await axios.post(
        "https://developer.easyslip.com/api/v1/verify",
        formData,
        {
          headers: {
            Authorization: "Bearer " + EASY_SLIP_TOKEN,
          },
        }
      );

      return data;
    } catch (error) {
      console.log("error response", error.response.data);
      return error.response.data;
    }
  }

  async function checkSlipResponse(checkSlipData, chatId, messageId) {
    if (checkSlipData.status === 200) {
      await addReaction(chatId, messageId, "😁");
      const messageTemplate = `
*Transaction Reference:* ${checkSlipData.data.transRef}
*Date:* ${checkSlipData.data.date}
*Amount:* ${checkSlipData.data.amount.amount}
*Sender:* ${checkSlipData.data.sender.account.name.th}
*Receiver:* ${checkSlipData.data.receiver.account.name.th}
`;
      await sendMessage(chatId, messageTemplate);
    } else if (checkSlipData.status === 404) {
      await addReaction(chatId, messageId, "😡");
      const messageTemplate = `
*Error ${checkSlipData.message}*
อ่านข้อมูลจาก QR Code ไม่ได้ สุ่มเสี่ยงเป็น slip ปลอม
`;
      await sendMessage(chatId, messageTemplate);
    } else {
      const messageTemplate = checkSlipData.message;

      // send message to telegram
      await sendMessage(chatId, messageTemplate);
    }
  }
}

const downloadTelegramFile = async (fileId) => {
  try {
    // Step 1: Get File Path from Telegram
    const { data } = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const filePath = data.result.file_path;

    // Step 2: Construct File URL
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const fileExtension = path.extname(filePath) || ".jpg"; // Default to .jpg

    // Step 3: Define Local Save Path
    const localFileName = `image_${Date.now()}${fileExtension}`;
    const localFilePath = path.join(DOWNLOAD_FOLDER, localFileName);

    // Step 4: Download and Save File
    const response = await axios({
      url: fileUrl,
      method: "GET",
      responseType: "stream",
    });

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(localFilePath);
      response.data.pipe(writer);
      writer.on("finish", () => resolve(localFilePath));
      writer.on("error", reject);
    });
  } catch (error) {
    console.error("Download Error:", error);
    throw new Error("Failed to download file.");
  }
};
