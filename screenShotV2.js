const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const chromium = require("@sparticuz/chromium");
const AWS = require("aws-sdk");

AWS.config.update({ region: "ap-southeast-1" });

const s3 = new AWS.S3();

async function initializeBrowser() {
  let browser = null;
  if (!browser || !browser.isConnected()) {
    puppeteerExtra.use(StealthPlugin());
    console.time("Browser Launch Time");
    browser = await puppeteerExtra.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    console.timeEnd("Browser Launch Time");
  }
  return browser;
}

async function scrape(url) {
  console.log("URL", url);
  let result = null;
  let link = null;
  try {
    console.time("Browser Initialization");
    const browser = await initializeBrowser();
    console.timeEnd("Browser Initialization");

    console.time("Page Creation");
    let page = await browser.newPage();
    console.timeEnd("Page Creation");

    console.time("Page Navigation");
    await page.goto(url, {
      waitUntil: "networkidle2",
    });
    console.timeEnd("Page Navigation");
    console.time("View Port");
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2, // optional for sharper images
    });
    console.timeEnd("View Port");
    console.time("Screenshot Capture");
    let buffer = await page.screenshot();
    console.timeEnd("Screenshot Capture");

    console.time("S3 Upload");
    const params = {
      Bucket: `${process.env.S3BUCKET}`,
      Key: `${Date.now()}.png`,
      Body: buffer,
      ContentType: "image/png",
      ACL: "public-read",
    };
    result = await s3.putObject(params).promise();
    link = `${process.env.S3URL}${params.Key}`;
    console.timeEnd("S3 Upload");

    console.log(link);

    console.time("Page Close");
    try {
      const pages = await browser.pages();
      let page;

      console.log("Pages open:", pages.length);

      for (let i = 0; i < pages.length; i++) {
        page = pages[i];
        await page.close();
      }
    } catch (e) {
      console.error("Unexpected error when closing page:", e);
    }
    //await page.close(); // Ensure the page is closed properly
    console.timeEnd("Page Close");

    return link;
  } catch (error) {
    console.error("Error during scraping:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
}

exports.handler = async (event) => {
  try {
    console.log(event);
    const body = event.body ? JSON.parse(event.body) : {};
    const { url } = body;
    console.log("URL Before func Call", url);
    console.time("Total Scrape Time");
    const data = await scrape(
      url ||
        "https://coingpt-chart.s3.ap-southeast-1.amazonaws.com/chartWidget.html?symbol=BINANCE:BTCUSDT&interval=60"
    );
    console.timeEnd("Total Scrape Time");

    console.log("Data", data);
    return {
      statusCode: 200,
      body: JSON.stringify({ data }),
    };
  } catch (error) {
    console.error("Handler Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
