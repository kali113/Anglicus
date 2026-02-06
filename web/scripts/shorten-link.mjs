const [, , longUrl] = process.argv;

if (!longUrl) {
  console.error("Usage: npm run shorten -- <url>");
  process.exit(1);
}

const apiUrl = new URL("https://tinyurl.com/api-create.php");
apiUrl.searchParams.set("url", longUrl);

const response = await fetch(apiUrl);

if (!response.ok) {
  throw new Error(`Shortener request failed with status ${response.status}`);
}

const shortUrl = (await response.text()).trim();

if (!shortUrl) {
  throw new Error("Shortener returned an empty response");
}

console.log(shortUrl);
