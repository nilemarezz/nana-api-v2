import { getDataByAccount, insertNewRecord } from "../service/googlesheet.js";
import moment from "moment-timezone";

export async function SearchController(request, reply) {
  // Receive request params
  const account = request.params.account;

  // Access the Google Sheets connection from Fastify instance
  const sheets = request.server.sheets;

  const data = await getDataByAccount(sheets, "รวมทั้งหมด", account);
  if (data.length === 0) {
    reply.send({ success: true, data: [] });
  } else {
    const sortedData = data.sort((a, b) =>
      b.release_date_compare > a.release_date_compare ? 1 : -1
    );
    const groupedData = await groupDate(sortedData);
    const resData = [];
    Object.keys(groupedData).map((key) => {
      resData.push({ key: key, value: [...groupedData[key]] });
    });
    reply.send({ success: true, data: resData });
  }
}

const groupDate = (rows) => {
  let group = rows.reduce((r, a) => {
    r[a.release_date_format] = [...(r[a.release_date_format] || []), a];
    return r;
  }, {});
  return group;
};

export async function FormAdminController(request, reply) {
  // Receive request body
  const formData = request.body;
  console.log(formData);

  if (!formData) {
    reply.status(400).send({ success: false, message: "Invalid form data" });
    return;
  }

  // Access the Google Sheets connection from Fastify instance
  const sheets = request.server.sheets;

  // create new record
  const rowData = [];
  formData.product.map((item, i) => {
    const row = [];
    row.push(moment().tz("Asia/Bangkok").format("M/D/YYYY HH:mm:ss"));
    row.push(formData.account);
    row.push(item.product_name);
    row.push(item.product_detail);
    row.push(item.product_amount);
    row.push(item.product_price);
    row.push(formData.paymentMethod);
    row.push(item.product_pay);
    row.push(item.product_total2);
    row.push(
      item.paid_date === "Invalid date" || item.paid_date === ""
        ? ""
        : moment(item.paid_date).tz("Asia/Bangkok").format("M/D/YYYY")
    );
    row.push(
      item.release_date === "Invalid date" || item.release_date === ""
        ? ""
        : moment(item.release_date).tz("Asia/Bangkok").format("M/D/YYYY")
    );
    row.push(item.product_shipping_method);
    row.push("");
    row.push(item.already_order);
    row.push(formData.address);
    row.push(formData.caution);

    rowData.push(row);
  });

  await insertNewRecord(sheets, "รวมทั้งหมด", rowData);

  // Send a response back to the client
  reply.send({ success: true });
}
