import express from "express";
import { getStatus } from "./get-status";

const app = express();
const port = process.env.PORT || 8081;

app.get("/", async (req, res) => {
  let status = await getStatus();
  res.setHeader("Content-Type", "application/json");
  res.send(status);
});

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});
