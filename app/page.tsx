import { redirect } from "next/navigation";

// middleware.ts sends signed-in users to their home (/home or /dashboard)
export default function Home() {
  redirect("/login");
}
