import express from "express";
import apicache from "apicache";
import cors from "cors";
import cron from "node-cron";
import path from "path";
import fs from "fs";
import { log } from "./debug";
import getLandingPageQNData from "./get-landing-page-qn-data";
import getPrice from "./get-price";
import getCirculatingSupply from "./get-circulating-supply";
import { calculateMinutesUntilNextInterval } from "./utils";
import getTotalSupply from "./get-total-supply";
import { DashboardAPI } from "./dashboardApi";
import { dashboardDataSchema, landingPageDataSchema } from "./validation";

const app = express();
const cache = apicache.middleware;
const port = process.env.PORT || 8081;
const LANDING_PAGE_DATA_PATH = path.join(__dirname, "../landing-page-data.json");
const CIRCULATING_SUPPLY_DATA_PATH = path.join(__dirname, "../circulating-supply-data.json");
const TOTAL_SUPPLY_DATA_PATH = path.join(__dirname, "../total-supply-data.json");
const DASHBOARD_DATA_PATH = path.join(__dirname, "../dashboard-data.json");

app.use(cors());
app.use(express.json());

const dashboardAPI = new DashboardAPI();

const scheduleCronJob = async () => {
  console.log("Scheduling cron job...");

  const fetchAndWriteLandingPageData = async () => {
    const [
      circulatingSupplyData,
      totalSupplyData,
      price,
      { nfts, proposals, payouts, creators, ...rest },
    ] = await Promise.all([
      getCirculatingSupply(),
      getTotalSupply(),
      getPrice(),
      getLandingPageQNData(),
    ]);

    try {
      const landingPageData = landingPageDataSchema.parse({
        ...price,
        ...circulatingSupplyData,
        ...totalSupplyData,
        carouselData: { nfts, proposals, payouts, creators },
        ...rest,
      });

      fs.writeFileSync(LANDING_PAGE_DATA_PATH, JSON.stringify(landingPageData, null, 2));
    } catch (e) {
      console.error(e);
      /* If the data is invalid, we don't want to write anything to the file. */
    }
  };

  const fetchAndWriteSupplyData = async () => {
    const circulatingSupplyData = await getCirculatingSupply();
    const totalSupplyData = await getTotalSupply();

    fs.writeFileSync(CIRCULATING_SUPPLY_DATA_PATH, JSON.stringify(circulatingSupplyData, null, 2));
    fs.writeFileSync(TOTAL_SUPPLY_DATA_PATH, JSON.stringify(totalSupplyData, null, 2));
  };

  const fetchAndWriteDashboardData = async () => {
    try {
      const dashboardData = dashboardDataSchema.parse(await dashboardAPI.getFullData());

      fs.writeFileSync(DASHBOARD_DATA_PATH, JSON.stringify(dashboardData, null, 2));
    } catch (e) {
      console.error(e);
      /* If the data is invalid, we don't want to write anything to the file. */
    }
  };

  // Fetch data initially such that we have something to serve. There will at most
  // be a buffer of 5 minutes from this running until the first cron execution.
  if (!fs.existsSync(CIRCULATING_SUPPLY_DATA_PATH) || !fs.existsSync(TOTAL_SUPPLY_DATA_PATH))
    await fetchAndWriteSupplyData();

  if (!fs.existsSync(LANDING_PAGE_DATA_PATH)) await fetchAndWriteLandingPageData();
  if (!fs.existsSync(DASHBOARD_DATA_PATH)) await fetchAndWriteDashboardData();

  cron.schedule("0 * * * *", fetchAndWriteLandingPageData);
  cron.schedule("*/5 * * * *", fetchAndWriteSupplyData);
  cron.schedule("0 */4 * * *", fetchAndWriteDashboardData);
};

app.get("/price", cache("10 minutes"), async (req, res) => {
  let price = await getPrice();
  res.setHeader("Content-Type", "application/json");
  res.send(price);
});

app.get("/circulating-supply", async (req, res) => {
  if (fs.existsSync(CIRCULATING_SUPPLY_DATA_PATH)) {
    const circulatingSupplyData = fs.readFileSync(CIRCULATING_SUPPLY_DATA_PATH);
    res.setHeader("Content-Type", "text/plain");
    const { circulatingSupply } = JSON.parse(circulatingSupplyData.toString());
    res.send(`${circulatingSupply}`).end();

    return;
  }

  res.setHeader("Retry-After", calculateMinutesUntilNextInterval(5));
  res.status(503).send();
});

app.get("/total-supply", async (req, res) => {
  if (fs.existsSync(TOTAL_SUPPLY_DATA_PATH)) {
    const totalSupplyData = fs.readFileSync(TOTAL_SUPPLY_DATA_PATH);
    res.setHeader("Content-Type", "text/plain");
    const { totalSupply } = JSON.parse(totalSupplyData.toString());
    res.send(`${totalSupply}`).end();

    return;
  }

  res.setHeader("Retry-After", calculateMinutesUntilNextInterval(5));
  res.status(503).send();
});

app.get("/landing-page-data", async (req, res) => {
  if (fs.existsSync(LANDING_PAGE_DATA_PATH)) {
    const landingPageData = fs.readFileSync(LANDING_PAGE_DATA_PATH);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.parse(landingPageData.toString()));

    return;
  }

  res.setHeader("Retry-After", calculateMinutesUntilNextInterval(60));
  res.status(503).send();
});

app.get("/dashboard-data", async (req, res) => {
  if (fs.existsSync(DASHBOARD_DATA_PATH)) {
    const dashboardData = fs.readFileSync(DASHBOARD_DATA_PATH);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.parse(dashboardData.toString()));

    return;
  }

  res.setHeader("Retry-After", calculateMinutesUntilNextInterval(60 * 4));
  res.status(503).send();
});

scheduleCronJob().then(() => {
  app.listen(port, () => {
    log(`server started at http://localhost:${port}`);
  });
});
