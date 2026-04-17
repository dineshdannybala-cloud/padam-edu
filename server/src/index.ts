import { createApp } from "./app.js";

const app = createApp();
const port = Number(process.env.PORT || 8080);

app.listen(port, () => {
  // Keep log simple so this can be read quickly in terminal while developing.
  console.log(`Server listening on http://localhost:${port}`);
});
