// Lighthouse CI config for the post-deploy validation jobs (deploy-staging.yml
// and deploy-production.yml). The deployed URL is passed on the command line:
//   npx @lhci/cli autorun --collect.url="$NEXT_PUBLIC_SITE_URL"
//
// Thresholds are `warn` to start — they report regressions in the run log
// without red-failing the deploy on a first, un-baselined measurement. Once a
// real baseline exists for the deployed site, flip the ones that matter to
// `error` to make them load-bearing (see Vine's deploy-*.yml for that posture).
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1,
    },
    upload: {
      target: "filesystem",
      outputDir: "./lhci_reports",
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.7 }],
        "categories:accessibility": ["warn", { minScore: 0.8 }],
        "categories:best-practices": ["warn", { minScore: 0.8 }],
        "categories:seo": ["warn", { minScore: 0.8 }],
        "render-blocking-resources": "off",
        "uses-long-cache-ttl": "off",
      },
    },
  },
};
