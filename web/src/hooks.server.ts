import type { Handle } from "@sveltejs/kit";

const LOCALE_RE = /\/(en|es)(?=\/|$)/;

const resolveHtmlLang = (pathname: string): "en" | "es" => {
  const match = pathname.match(LOCALE_RE);
  return match?.[1] === "es" ? "es" : "en";
};

export const handle: Handle = async ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace(
        /<html lang="[^"]*">/,
        `<html lang="${resolveHtmlLang(event.url.pathname)}">`,
      ),
  });
