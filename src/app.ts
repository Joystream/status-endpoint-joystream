import express from "express";
import apicache from "apicache";
import cors from "cors";
import cron from "node-cron";
import path from "path";
import fs from "fs";
import { getStatus } from "./get-status";
import { getBudgets } from "./get-budgets";
import { log } from "./debug";
import getLandingPageQNData from "./get-landing-page-qn-data";
import getPrice from "./get-price";
import getCirculatingSupply from "./get-circulating-supply";
import { calculateSecondsUntilNext5MinuteInterval } from "./utils";
import getTotalSupply from "./get-total-supply";
import getAddresses from "./get-addresses";

const app = express();
const cache = apicache.middleware;
const port = process.env.PORT || 8081;
const LANDING_PAGE_DATA_PATH = path.join(__dirname, "../landing-page-data.json");
const CIRCULATING_SUPPLY_DATA_PATH = path.join(__dirname, "../circulating-supply-data.json");
const TOTAL_SUPPLY_DATA_PATH = path.join(__dirname, "../total-supply-data.json");
const ADDRESSES_DATA_PATH = path.join(__dirname, "../addresses-data.json");
const ADDRESS_UI_HTML = path.join(__dirname, "../public/address_ui.ejs");

app.use(cors());
app.use(express.json());
app.set("view engine", "ejs");

const scheduleCronJob = async () => {
  console.log("Scheduling cron job...");

  const fetchAndWriteLandingPageData = async () => {
    const [
      circulatingSupplyData,
      totalSupplyData,
      price,
      budgets,
      { nfts, proposals, payouts, creators, ...rest },
    ] = await Promise.all([
      getCirculatingSupply(),
      getTotalSupply(),
      getPrice(),
      getBudgets(),
      getLandingPageQNData(),
    ]);

    fs.writeFileSync(
      LANDING_PAGE_DATA_PATH,
      JSON.stringify(
        {
          ...price,
          ...circulatingSupplyData,
          ...totalSupplyData,
          budgets,
          carouselData: { nfts, proposals, payouts, creators },
          ...rest,
        },
        null,
        2
      )
    );
  };

  const fetchAndWriteSupplyData = async () => {
    const circulatingSupplyData = await getCirculatingSupply();
    const totalSupplyData = await getTotalSupply();
    const { addresses } = await getAddresses();

    fs.writeFileSync(CIRCULATING_SUPPLY_DATA_PATH, JSON.stringify(circulatingSupplyData, null, 2));
    fs.writeFileSync(TOTAL_SUPPLY_DATA_PATH, JSON.stringify(totalSupplyData, null, 2));
    fs.writeFileSync(
      ADDRESSES_DATA_PATH,
      JSON.stringify(
        {
          total_supply: totalSupplyData.totalSupply,
          circulating_supply: circulatingSupplyData.circulatingSupply,
          addresses,
        },
        null,
        2
      )
    );
  };

  // Fetch data initially such that we have something to serve. There will at most
  // be a buffer of 5 minutes from this running until the first cron execution.
  if (
    !fs.existsSync(CIRCULATING_SUPPLY_DATA_PATH) ||
    !fs.existsSync(TOTAL_SUPPLY_DATA_PATH) ||
    !fs.existsSync(ADDRESSES_DATA_PATH)
  )
    await fetchAndWriteSupplyData();
  if (!fs.existsSync(LANDING_PAGE_DATA_PATH)) await fetchAndWriteLandingPageData();

  // TODO: This data should be converted to landing page data and moved to 1h+ cache.
  cron.schedule("*/5 * * * *", fetchAndWriteLandingPageData);
  cron.schedule("*/5 * * * *", fetchAndWriteSupplyData);
};

app.get("/", cache("1 hour"), async (req, res) => {
  let status = await getStatus();
  res.setHeader("Content-Type", "application/json");
  res.send(status);
});

app.get("/budgets", cache("1 day"), async (req, res) => {
  let budgets = await getBudgets();
  res.setHeader("Content-Type", "application/json");
  res.send(budgets);
});

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

  res.setHeader("Retry-After", calculateSecondsUntilNext5MinuteInterval());
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

  res.setHeader("Retry-After", calculateSecondsUntilNext5MinuteInterval());
  res.status(503).send();
});

app.get("/addresses", async (req, res) => {
  if (fs.existsSync(ADDRESSES_DATA_PATH)) {
    const addressesFileData = fs.readFileSync(ADDRESSES_DATA_PATH);
    res.setHeader("Content-Type", "application/json");
    const addressesData = JSON.parse(addressesFileData.toString());
    res.send(addressesData);

    return;
  }

  res.setHeader("Retry-After", calculateSecondsUntilNext5MinuteInterval());
  res.status(503).send();
});

app.get("/address", async (req, res) => {
  if (fs.existsSync(ADDRESSES_DATA_PATH)) {
    res.setHeader("Content-Type", "application/json");

    if (!req.query.address) {
      res.send({});
      return;
    }

    const addressesFileData = fs.readFileSync(ADDRESSES_DATA_PATH);
    const { addresses } = JSON.parse(addressesFileData.toString());
    const receivedAddress = req.query.address as string;

    res.send({ [receivedAddress]: addresses[receivedAddress] });

    return;
  }

  res.setHeader("Retry-After", calculateSecondsUntilNext5MinuteInterval());
  res.status(503).send();
});

app.get("/address_ui", async (req, res) => {
  if (!fs.existsSync(ADDRESSES_DATA_PATH)) {
    res.setHeader("Retry-After", calculateSecondsUntilNext5MinuteInterval());
    res.status(503).send();
    return;
  }

  if (!req.query.address) {
    res.render(ADDRESS_UI_HTML);
    return;
  }

  const addressesFileData = fs.readFileSync(ADDRESSES_DATA_PATH);
  const { addresses } = JSON.parse(addressesFileData.toString());

  res.render(ADDRESS_UI_HTML, {
    address: req.query.address,
    ...addresses[req.query.address as string],
  });
});

app.get("/landing-page-data", async (req, res) => {
  if (fs.existsSync(LANDING_PAGE_DATA_PATH)) {
    const landingPageData = fs.readFileSync(LANDING_PAGE_DATA_PATH);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.parse(landingPageData.toString()));

    return;
  }

  res.setHeader("Retry-After", calculateSecondsUntilNext5MinuteInterval());
  res.status(503).send();
});

scheduleCronJob().then(() => {
  app.listen(port, () => {
    log(`server started at http://localhost:${port}`);
  });
});
