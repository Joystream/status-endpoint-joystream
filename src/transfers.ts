//import { db } from "./testdb";
import { JoyApi } from "./joyApi";
import { config } from "dotenv";
config();

const provider = process.env.PROVIDER || "ws://127.0.0.1:9944";

const joy = new JoyApi(provider);

// Known account we want to use (available on dev chain, with funds)

// Listen to all tx to Jsgenesis address
// Add them to exchanges. Calculate the Dollar Value, and log all the other info. Set completed to false.

async function main() {
  // Create an await for the API
  const { api } = await joy.init;

  api.query.system.events((events: any) => {
    console.log("----- Received " + events.length + " event(s): -----");
    // loop through the Vec<EventRecord>
    events.forEach((record: any) => {
      // extract the phase, event and the event types
      const { event, phase, topics } = record;
      const types = event.typeDef;
      // show what we are busy with
      console.log(JSON.stringify({ event, phase, topics }));
      // loop through each of the parameters, displaying the type and data
      event.data.forEach((data: any, index: any) => {
        console.log(types[index].type + ";" + data.toString());
      });
    });
  });
}

main().catch(console.error);
