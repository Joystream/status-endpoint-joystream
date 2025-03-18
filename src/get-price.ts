import axios from "axios";

if (process.env.COINGECKO_API_KEY === undefined) {
  throw new Error("Missing COINGECKO_API_KEY in .env!");
}

const { COINGECKO_API_KEY } = process.env;

const getPrice = async () => {
  try {
    const { data } = await axios.get<{ joystream?: { usd?: number  } }>(
      " https://api.coingecko.com/api/v3/simple/price",
      {
        params: {
          ids: "joystream",
          vs_currencies: "usd",
        },
        headers: {
          Accepts: "application/json",
          "x-cg-pro-api-key": COINGECKO_API_KEY,
        },
      }
    );

    return { price: data.joystream?.usd || 0 };
  } catch (e) {
    // In case there are problems with the API, we just return 0.

    return { price: 0 };
  }
};

export default getPrice;
