import express from "express";
import apicache from "apicache";
import cors from "cors";
import cron from "node-cron";
import { getStatus } from "./get-status";
import { getBudgets } from "./get-budgets";
import { log } from "./debug";
import getCarouselData from "./get-carousel-data";
import getPrice from "./get-price";
import path from "path";
import fs from "fs";

const app = express();
const cache = apicache.middleware;
const port = process.env.PORT || 8081;
const CAROUSEL_DATA_PATH = path.join(__dirname, "../carousel-data.json");

app.use(cors());
app.use(express.json());

const scheduleCronJob = () => {
  console.log("Scheduling cron job...");

  const fetchAndWriteData = async () => {
    const carouselData = await getCarouselData();

    fs.writeFileSync(CAROUSEL_DATA_PATH, JSON.stringify(carouselData, null, 2));
  };

  // Fetch data initially such that we have something to serve. There will at most
  // be a buffer of 5 minutes from this running until the first cron execution.
  fetchAndWriteData();

  cron.schedule("*/5 * * * *", async () => fetchAndWriteData());
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

app.get("/carousel-data", async (req, res) => {
  if (fs.existsSync(CAROUSEL_DATA_PATH)) {
    const carouselData = fs.readFileSync(CAROUSEL_DATA_PATH);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.parse(carouselData.toString()));

    return;
  }

  let nfts = await getCarouselData();
  res.setHeader("Content-Type", "application/json");
  res.send(nfts);
});

app.get("/price", cache("10 minutes"), async (req, res) => {
  let price = await getPrice();
  res.setHeader("Content-Type", "application/json");
  res.send(price);
});

scheduleCronJob();

app.listen(port, () => {
  log(`server started at http://localhost:${port}`);
});
