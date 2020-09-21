import express from "express";
import cors from "cors";
import { getStatus } from "./get-status";
import startTransfersMonitor from './transfers';
import { log } from './debug';

const app = express();
const port = process.env.PORT || 8081;

startTransfersMonitor();

app.use(cors());
app.get("/", async (req, res) => {
  let status = await getStatus();
  res.setHeader("Content-Type", "application/json");
  res.send(status);
});

app.listen(port, () => {
  log(`server started at http://localhost:${port}`);
});
