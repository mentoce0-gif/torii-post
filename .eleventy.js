const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  const md = markdownIt({ html: true, linkify: false }).use(markdownItAnchor, {
    slugify: (s) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9 -]/g, "")
        .trim()
        .replace(/\s+/g, "-"),
  });
  eleventyConfig.setLibrary("md", md);

  eleventyConfig.addFilter("readableDate", (d) =>
    new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })
  );
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString().split("T")[0]);

  // Extract h2 headings from rendered content for a table of contents
  eleventyConfig.addFilter("toc", (content) => {
    if (!content) return [];
    const matches = [...content.matchAll(/<h2 id="([^"]+)"[^>]*>(.*?)<\/h2>/g)];
    return matches.map((m) => ({
      id: m[1],
      text: m[2].replace(/<[^>]+>/g, ""),
    }));
  });

  eleventyConfig.addFilter("readingTime", (content) => {
    if (!content) return 1;
    const words = content.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 230));
  });

  return {
    dir: { input: "src", includes: "_includes", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
