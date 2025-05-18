import {defineConfig} from "vite";
import {resolve} from "path";
import {viteSingleFile} from "vite-plugin-singlefile";
import fs from "fs";
import path from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    assetsInlineLimit: 10000000, // 提高内联限制，确保所有资源都被内联
    cssCodeSplit: false, // 不拆分CSS
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  plugins: [
    viteSingleFile({
      inlinePattern: [
        "**/*.js",
        "**/*.css",
        "**/*.png",
        "**/*.ico",
        "**/*.jpg",
        "**/*.jpeg",
        "**/*.gif",
      ],
      removeInlinedFiles: true,
      useRecommendedBuildConfig: false, // 禁用推荐配置，使用我们自己的配置
    }),
    {
      name: "transform-html",
      transformIndexHtml(html) {
        // 转换脚本标签以便在Vite中正确加载
        return html
          .replace(
            /<script src="(.*?)"><\/script>/g,
            '<script type="module" src="$1"></script>'
          )
          .replace(
            /<link href="(.*?)" rel="stylesheet" type="text\/css">/g,
            '<link rel="stylesheet" href="$1">'
          );
      },
    },
    {
      name: "resolve-paths",
      resolveId(id) {
        // 处理可能没有./前缀的路径
        if (
          id.startsWith("js/") ||
          id.startsWith("style/") ||
          id.startsWith("meta/")
        ) {
          return resolve(__dirname, id);
        }
        return null;
      },
    },
    {
      name: "legacy-module-support",
      transform(code, id) {
        // 将非模块化的JS文件转换为ES模块
        if (id.endsWith(".js") && !id.includes("node_modules")) {
          // 检查是否包含导出语句
          if (!code.includes("export ")) {
            // 将全局变量作为导出
            const fileName = id.split("/").pop().replace(".js", "");
            const possibleExportNames = [
              fileName.charAt(0).toUpperCase() + fileName.slice(1),
              fileName,
            ];

            let modifiedCode = code;

            // 尝试找到并导出主要类或对象
            for (const name of possibleExportNames) {
              if (
                code.includes(`function ${name}`) ||
                code.includes(`var ${name}`) ||
                code.includes(`const ${name}`) ||
                code.includes(`let ${name}`) ||
                code.includes(`class ${name}`)
              ) {
                modifiedCode += `\nexport { ${name} };`;
                break;
              }
            }

            return modifiedCode;
          }
        }
        return null;
      },
    },
    {
      name: "copy-assets",
      apply: "build",
      closeBundle() {
        // 在构建完成后，查找dist中的文件
        const distDir = resolve(__dirname, "dist");
        const htmlFile = resolve(distDir, "index.html");
        const assetsDir = resolve(distDir, "assets");

        if (!fs.existsSync(htmlFile) || !fs.existsSync(assetsDir)) {
          console.error("无法找到构建后的文件");
          return;
        }

        let htmlContent = fs.readFileSync(htmlFile, "utf-8");

        // 读取assets目录中的所有文件
        const assetFiles = fs.readdirSync(assetsDir);

        // 处理每个资源文件
        assetFiles.forEach((file) => {
          const filePath = resolve(assetsDir, file);
          const fileStats = fs.statSync(filePath);

          if (fileStats.isFile()) {
            const fileName = path.basename(file);
            const fileExt = path.extname(file).substring(1);
            const isImage = ["png", "jpg", "jpeg", "gif", "ico"].includes(
              fileExt.toLowerCase()
            );

            if (isImage) {
              console.log(`内联资源文件: ${file}`);

              // 读取文件内容并转换为base64
              const buffer = fs.readFileSync(filePath);
              const base64 = buffer.toString("base64");

              // 查找并替换HTML中的引用
              const regex = new RegExp(
                `(href|src)="[^"]*?${fileName.split("-")[0]}[^"]*?"`,
                "g"
              );
              htmlContent = htmlContent.replace(
                regex,
                `$1="data:image/${fileExt};base64,${base64}"`
              );
            }
          }
        });

        // 写回修改后的HTML文件
        fs.writeFileSync(htmlFile, htmlContent);

        // 删除assets目录
        fs.rmSync(assetsDir, {recursive: true, force: true});

        console.log("所有资源已内联到单个HTML文件中");
      },
    },
  ],
});
