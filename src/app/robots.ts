import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // This site has no AMP pages — disallow AMP URL variants so
        // Googlebot stops crawling them and reporting them as invalid.
        disallow: ["/amp/", "/*?amp=*", "/*&amp=*"],
      },
    ],
    sitemap: "https://savstudio.app/sitemap.xml",
  };
}
