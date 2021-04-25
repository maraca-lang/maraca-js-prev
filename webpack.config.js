const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  mode: "development",
  entry: "./src/test.ts",
  devtool: "inline-source-map",
  devServer: {
    contentBase: "./lib",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: "Maraca",
    }),
  ],
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "lib"),
  },
};
