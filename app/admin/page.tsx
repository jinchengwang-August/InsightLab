import type { Metadata } from "next";
import AdminPortal from "./admin-portal";

export const metadata:Metadata={
  title:"InsightLab Owner Console",
  description:"Private InsightLab administration and user management.",
  robots:{index:false,follow:false},
};

export default function AdminPage(){
  return <AdminPortal/>;
}
