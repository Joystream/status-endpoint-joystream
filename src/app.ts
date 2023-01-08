import express from "express";
import cors from "cors";
import { getStatus } from "./get-status";
import { getBudgets } from "./get-budgets";
import { log } from './debug';

const app = express();
const port = process.env.PORT || 8081;

app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  let status = await getStatus();
  res.setHeader("Content-Type", "application/json");
  res.send(status);
});

app.get('/budgets', async (req, res) => {
  let budgets = await getBudgets();
  res.setHeader("Content-Type", "application/json");
  res.send(budgets);
});

app.listen(port, () => {
  log(`server started at http://localhost:${port}`);
});
