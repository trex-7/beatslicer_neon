# Granular Synth FX

## Hosting on GitHub Pages

This application is configured to be deployed to GitHub Pages.

### 1. Setting up Audio Files

To host your own loop library:

1.  Create a folder named `public` in the root of your project if it doesn't exist.
2.  Create a subfolder: `public/audio`.
3.  Add your `.mp3` or `.wav` files there.
4.  Update `utils/demoLoops.ts` to point to these files relative to the base URL:

```typescript
export const DEMO_LOOPS: DemoLoop[] = [
    { 
        name: "My Custom Loop 120bpm", 
        // Files in 'public/' are served at the root './'
        url: "./audio/my-custom-loop.mp3" 
    },
    // ...
];
```

### 2. Deploying

1.  Push your code to a GitHub repository.
2.  Go to your repository **Settings** > **Pages**.
3.  Under **Build and deployment**, select **Source** as `GitHub Actions`.
4.  If you are using a standard Vite build, you can use the `static-web-apps-deploy` action or simply build the project locally (`npm run build`) and commit the `dist` folder to a `gh-pages` branch.

**Easiest Method (gh-pages package):**

1.  `npm install gh-pages --save-dev`
2.  Add this to `package.json` scripts:
    ```json
    "scripts": {
      "predeploy": "npm run build",
      "deploy": "gh-pages -d dist"
    }
    ```
3.  Run `npm run deploy`.

The `vite.config.ts` file has been configured with `base: './'` to ensure all assets load correctly regardless of the repository name.
