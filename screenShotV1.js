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
      waitUntil: "domcontentloaded",
    });
    console.timeEnd("Page Navigation");

    try {
      console.time("Popup Handling");
      const closeButtonSelector = ".tv-dialog__close"; // Update with the close button selector
      await page.waitForSelector(closeButtonSelector, { timeout: 3000 }); // Wait for the popup
      await page.click(closeButtonSelector); // Close the popup
      console.log("Popup closed successfully");
      console.timeEnd("Popup Handling");
    } catch (e) {
      console.log("Popup not detected, continuing...");
    }

    console.time("Canvas Wait");
    const p1 = page.waitForSelector("canvas", { visible: true });
    console.timeEnd("Canvas Wait");

    const chartArea = await page.$(".chart-markup-table.pane");
    if (chartArea) {
      console.time("BoundingBox Calculation");
      const boundingBox = await chartArea.boundingBox();
      console.timeEnd("BoundingBox Calculation");
      if (boundingBox) {
        console.time("Mouse Interaction");
        await page.mouse.move(
          boundingBox.x + boundingBox.width / 2,
          boundingBox.y + boundingBox.height / 2
        );
        await page.mouse.down();
        await page.mouse.move(
          boundingBox.x + boundingBox.width / 2 - 200,
          boundingBox.y + boundingBox.height / 2,
          { steps: 10 }
        );
        await page.mouse.up();
        console.timeEnd("Mouse Interaction");
      }
    } else {
      throw new Error("Chart area not found");
    }

    const button = await page.$(
      'button[aria-label="Watchlist, details and news"]'
    );
    if (button) {
      console.time("Button Click");
      await button.click();
      console.timeEnd("Button Click");
    }
    await p1;
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

        // if (page.crawler_cdp_client)
        //   page.crawler_cdp_client.off("Network.requestIntercepted");

        // page.off("request");
        // page.off("response");
        // page.off("framenavigated");

        // await page.goto("about:blank");
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
        "https://www.tradingview.com/chart/9CtBCUjA/?symbol=BINANCE%3ABTCUSDT&interval=1H"
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
