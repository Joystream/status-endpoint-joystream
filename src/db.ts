import low from "lowdb";
import FileAsync from "lowdb/adapters/FileAsync";

const adapter = new FileAsync("exchanges.test.json");
const db = low(adapter);

export { db };
