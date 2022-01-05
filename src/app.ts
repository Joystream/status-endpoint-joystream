import express from "express";
import cors from "cors";
import { getStatus } from "./get-status";
import startTransfersMonitor from './transfers';
import { log } from './debug';
import { setExchangeStatus } from './setExchangeStatus';

const app = express();
const port = process.env.PORT || 8081;

if(process.env.PASSWORD === undefined) {
    throw new Error("Missing PASSWORD in .env!");
}

startTransfersMonitor();

app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  let status = await getStatus();
  res.setHeader("Content-Type", "application/json");
  res.send(status);
});

app.post("/status", async (req,res) => {
    const password = req.header("x-api-key");

    if(process.env.PASSWORD !== password) {
        res.status(401).send({
            message: "Wrong authentication credentials!"
        });
        return;
    }

    const { exchangeIndex, exchangeStatus } = req.body;

    if(!exchangeIndex || !exchangeStatus) {
        res.status(400).send({
            message: "Missing exchangeIndex or exchangeStatus in request body."
        });
        return;
    }

    const error = await setExchangeStatus(exchangeIndex, exchangeStatus);

    if(error) {
        res.status(400).send({ message: error });
        return;
    }

    res.status(200).send({
        message: `Succesfully updated the status of exchange ${exchangeIndex}`
    });
});

app.listen(port, () => {
  log(`server started at http://localhost:${port}`);
});
