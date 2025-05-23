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

    await page.waitForSelector("canvas", { visible: true });
    // await page.evaluate(() => {
    //   const canvas = document.querySelector("canvas");
    //   if (canvas) {
    //     canvas.style.left = "-200px";
    //   }
    // });
    const chartArea = await page.$(".chart-markup-table.pane");
    if (chartArea) {
      const boundingBox = await chartArea.boundingBox();
      if (boundingBox) {
        // Move mouse to the center of the chart area
        await page.mouse.move(
          boundingBox.x + boundingBox.width / 2,
          boundingBox.y + boundingBox.height / 2
        );
        // Click and hold the mouse button
        await page.mouse.down();
        // Drag the mouse left by 200 pixels
        await page.mouse.move(
          boundingBox.x + boundingBox.width / 2 - 200,
          boundingBox.y + boundingBox.height / 2,
          { steps: 10 }
        );
        // Release the mouse button
        await page.mouse.up();
      }
    }
    const button = await page.$(
      'button[aria-label="Watchlist, details and news"]'
    );
    if (button) {
      await button.click();
    }

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
}

exports.handler = async (event) => {
  try {
    console.log(event);
    const body = JSON.parse(event.body);
    const { url } = body;
    console.log("URL Before func Call", url);
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
