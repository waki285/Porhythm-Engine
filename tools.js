const axios = require("axios");
const fs = require("fs");

const a = axios.default.create({
  baseURL: "https://www.keishicho.metro.tokyo.lg.jp/play/rhythm/",
});
["notes/easy.json", "notes/normal.json", "notes/hard.json"].forEach((x) => {
  a.get(x, { responseType: "arraybuffer" }).then((y) =>
    fs.promises.writeFile(x, y.data)
  );
});
