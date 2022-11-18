const express = require('express')
const path = require('path')
const app = express()
const port = 8008

app.use(function(req, res, next) {
  // res.header("Cross-Origin-Embedder-Policy", "require-corp");
  // res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

app.use('/', express.static('./'));

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})