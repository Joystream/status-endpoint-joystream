import express from "express";
import apicache from "apicache";
import cors from "cors";
import cron from "node-cron";
import path from "path";
import fs from "fs";
import { getStatus } from "./get-status";
import { getBudgets } from "./get-budgets";
import { log } from "./debug";
import getCarouselData from "./get-carousel-data";
import getPrice from "./get-price";
import getCirculatingSupply from "./get-circulating-supply";
import { calculateSecondsUntilNext5MinuteInterval } from "./utils";
import getTotalSupply from "./get-total-supply";
import getAddresses from "./get-addresses";

const app = express();
const cache = apicache.middleware;
const port = process.env.PORT || 8081;
const CAROUSEL_DATA_PATH = path.join(__dirname, "../carousel-data.json");
const CIRCULATING_SUPPLY_DATA_PATH = path.join(__dirname, "../circulating-supply-data.json");
const TOTAL_SUPPLY_DATA_PATH = path.join(__dirname, "../total-supply-data.json");
const ADDRESS_UI_HTML = path.join(__dirname, "../public/address_ui.ejs");

app.use(cors());
app.use(express.json());
app.set("view engine", "ejs");

const scheduleCronJob = async () => {
  console.log("Scheduling cron job...");

  const fetchAndWriteCarouselData = async () => {
    const carouselData = await getCarouselData();

    fs.writeFileSync(CAROUSEL_DATA_PATH, JSON.stringify(carouselData, null, 2));
  };

  const fetchAndWriteSupplyData = async () => {
    const circulatingSupplyData = await getCirculatingSupply();
    const totalSupplyData = await getTotalSupply();

    fs.writeFileSync(CIRCULATING_SUPPLY_DATA_PATH, JSON.stringify(circulatingSupplyData, null, 2));
    fs.writeFileSync(TOTAL_SUPPLY_DATA_PATH, JSON.stringify(totalSupplyData, null, 2));
  };

  // Fetch data initially such that we have something to serve. There will at most
  // be a buffer of 5 minutes from this running until the first cron execution.
  if (!fs.existsSync(CIRCULATING_SUPPLY_DATA_PATH) || !fs.existsSync(TOTAL_SUPPLY_DATA_PATH))
    await fetchAndWriteSupplyData();
  if (!fs.existsSync(CAROUSEL_DATA_PATH)) await fetchAndWriteCarouselData();

  cron.schedule("*/5 * * * *", fetchAndWriteCarouselData);
  cron.schedule("*/5 * * * *", fetchAndWriteSupplyData);
};

app.get("/", cache("1 hour"), async (req, res) => {
  let status = await getStatus();
  res.setHeader("Content-Type", "application/json");
  res.send(status);
});

app.get("/addresses", async (req, res) => {
  const addresses = await getAddresses();
  res.setHeader("Content-Type", "application/json");
  res.send({ message: addresses });
});

app.get("/address_ui", async (req, res) => {
  if(!req.query.address) {
    res.render(ADDRESS_UI_HTML, { message: undefined});
    return;
  }

  res.render(ADDRESS_UI_HTML, {
    recordedAtBlock: 3_365_488,
    recordedAtTime: new Date().toISOString(),
    address: req.query.address,
    lockedBalance: 81501.99,
    totalBalance: 481502.016,
    transferrableBalance: 0.0195,
    vestingLock: 237404.53,
    vestable:2858.22
   });
});

app.get("/budgets", cache("1 day"), async (req, res) => {
  let budgets = await getBudgets();
  res.setHeader("Content-Type", "application/json");
  res.send(budgets);
});

app.get("/carousel-data", async (req, res) => {
  if (fs.existsSync(CAROUSEL_DATA_PATH)) {
    const carouselData = fs.readFileSync(CAROUSEL_DATA_PATH);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.parse(carouselData.toString()));

    return;
  }

  res.setHeader("Retry-After", calculateSecondsUntilNext5MinuteInterval());
  res.status(503).send();
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

scheduleCronJob().then(() => {
  app.listen(port, () => {
    log(`server started at http://localhost:${port}`);
  });
});
