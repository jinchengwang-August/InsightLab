import type { MetadataRoute } from "next";

export default function manifest():MetadataRoute.Manifest{
  return {
    name:"InsightLab",
    short_name:"InsightLab",
    description:"Validate ideas with founders, contributors, and investors.",
    start_url:"/",
    display:"standalone",
    background_color:"#241921",
    theme_color:"#334a3a",
    orientation:"portrait-primary",
    icons:[{src:"/favicon.svg",sizes:"any",type:"image/svg+xml"}],
  };
}
