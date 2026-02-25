// @ts-nocheck
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const buildDir = resolve(process.cwd(), "build");
const hasBuildArtifacts = existsSync(resolve(buildDir, "index.html"));
const shouldRunSeoBuildTest = process.env.SEO_BUILD_TEST === "1";

const readBuildFile = (relativePath: string): string =>
  readFileSync(resolve(buildDir, relativePath), "utf8");

const expectContains = (html: string, snippet: string): void => {
  expect(
    html.includes(snippet),
    `Expected HTML to contain snippet: ${snippet}`,
  ).toBe(true);
};

describe.skipIf(!(hasBuildArtifacts && shouldRunSeoBuildTest))(
  "SEO build artifacts",
  () => {
    const indexableRoutes = [
      {
        file: "en/index.html",
        lang: "en",
        canonical: "https://kali113.github.io/Anglicus/en/",
        alternates: [
          'hreflang="en" href="https://kali113.github.io/Anglicus/en/"',
          'hreflang="es" href="https://kali113.github.io/Anglicus/es/"',
          'hreflang="x-default" href="https://kali113.github.io/Anglicus/"',
        ],
        inLanguage: '"inLanguage":"en"',
      },
      {
        file: "es/index.html",
        lang: "es",
        canonical: "https://kali113.github.io/Anglicus/es/",
        alternates: [
          'hreflang="en" href="https://kali113.github.io/Anglicus/en/"',
          'hreflang="es" href="https://kali113.github.io/Anglicus/es/"',
          'hreflang="x-default" href="https://kali113.github.io/Anglicus/"',
        ],
        inLanguage: '"inLanguage":"es"',
      },
      {
        file: "en/legal/index.html",
        lang: "en",
        canonical: "https://kali113.github.io/Anglicus/en/legal/",
        alternates: [
          'hreflang="en" href="https://kali113.github.io/Anglicus/en/legal/"',
          'hreflang="es" href="https://kali113.github.io/Anglicus/es/legal/"',
          'hreflang="x-default" href="https://kali113.github.io/Anglicus/en/legal/"',
        ],
        inLanguage: '"inLanguage":"en"',
      },
      {
        file: "es/legal/index.html",
        lang: "es",
        canonical: "https://kali113.github.io/Anglicus/es/legal/",
        alternates: [
          'hreflang="en" href="https://kali113.github.io/Anglicus/en/legal/"',
          'hreflang="es" href="https://kali113.github.io/Anglicus/es/legal/"',
          'hreflang="x-default" href="https://kali113.github.io/Anglicus/en/legal/"',
        ],
        inLanguage: '"inLanguage":"es"',
      },
    ] as const;

    it("keeps indexable pages locale-correct and SEO complete", () => {
      for (const route of indexableRoutes) {
        const html = readBuildFile(route.file);

        expectContains(html, `<html lang="${route.lang}">`);
        expectContains(
          html,
          'meta name="robots" content="index,follow,max-image-preview:large"',
        );
        expectContains(html, `rel="canonical" href="${route.canonical}"`);

        for (const alternate of route.alternates) {
          expectContains(html, alternate);
        }

        expectContains(html, '"@type":"Organization"');
        expectContains(html, '"@type":"WebSite"');
        expectContains(html, route.inLanguage);
      }
    });

    it("keeps selector and legacy legal pages non-indexable", () => {
      const rootHtml = readBuildFile("index.html");
      const legacyLegalHtml = readBuildFile("legal/index.html");

      expectContains(rootHtml, '<html lang="en">');
      expectContains(rootHtml, 'meta name="robots" content="noindex,follow"');
      expectContains(
        rootHtml,
        'rel="canonical" href="https://kali113.github.io/Anglicus/"',
      );
      expectContains(legacyLegalHtml, 'meta name="robots" content="noindex,follow"');
    });
  },
);
