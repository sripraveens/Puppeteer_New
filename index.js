const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const chromium = require("@sparticuz/chromium");
const AWS = require("aws-sdk");
//require("dotenv").config();
AWS.config.update({ region: "ap-southeast-1" });

const s3 = new AWS.S3();
async function scrape(url) {
  console.log("URL", url);
  let result = null;
  let link = null;
  try {
    puppeteerExtra.use(StealthPlugin());

    const browser = await puppeteerExtra.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(), //if dont work try executablePath
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    let page = await browser.newPage();
    await page.goto(
      url ||
        "https://www.tradingview.com/chart/9CtBCUjA/?symbol=BINANCE%3ABTCUSDT&interval=1H",
      {
        waitUntil: "networkidle2",
      }
    );
    await page.waitForSelector("canvas");

    await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      canvas.style.left = "-200px";
    });

    const buffer = await page.screenshot();
    console.log("S3 step below");
    console.log(process.env.S3BUCKET);
    console.log(process.env.S3URL);
    const params = {
      Bucket: `${process.env.S3BUCKET}`,
      Key: `${Date.now()}.png`,
      Body: buffer,
      ContentType: "image/png",
      ACL: "public-read",
    };

    result = await s3.putObject(params).promise();
    link = `${process.env.S3URL}${params.Key}`;
    console.log(link);
    return link;
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
  // This makes the lamda to timeout sometimes, weird, but anyway after the lamda closes, everything gets shut down automatically, so shouln't be an issue
  //   finally {
  //     console.log("Finally ran");
  //     const pages = await browser.pages();
  //     await Promise.all(pages.map(async (page) => page.close()));
  //     await browser.close();
  //   }
}

exports.handler = async (event) => {
  try {
    console.log(event);
    const body = JSON.parse(event.body);
    const { url } = body;
    console.log("URL Befoer func Call", url);
    const data = await scrape(url);
    console.log("Data", data);
    return {
      statusCode: 200,
      body: JSON.stringify({ data }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
