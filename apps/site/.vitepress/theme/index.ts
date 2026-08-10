import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import HeroDemo from "../../components/HeroDemo.vue";
import MetricTable from "../../components/MetricTable.vue";
import Sandbox from "../../components/Sandbox.vue";
import SupportMatrix from "../../components/SupportMatrix.vue";
import "./styles.css";

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component("HeroDemo", HeroDemo);
    app.component("MetricTable", MetricTable);
    app.component("SupportMatrix", SupportMatrix);
    app.component("Sandbox", Sandbox);
  },
};

export default theme;
