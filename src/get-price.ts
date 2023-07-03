import axios from "axios";

if (process.env.CMC_API_KEY === undefined) {
  throw new Error("Missing CMC_API_KEY in .env!");
}

const API_KEY = process.env.CMC_API_KEY;
const JOYSTREAM_CMC_TOKEN_ID = "6827";

const getPrice = async () => {
  try {
    const {
      data: { data },
    } = await axios.get(
      "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?slug=joystream&convert=USD",
      {
        // body: JSON.stringify(params),
        headers: {
          Accepts: "application/json",
          "X-CMC_PRO_API_KEY": API_KEY,
        },
      }
    );

    return { price: data[JOYSTREAM_CMC_TOKEN_ID].quote.USD.price };
  } catch (e) {
    // In case there are problems with the API, we just return 0.

    return { price: 0 };
  }
};

export default getPrice;
