import { redirect } from "next/navigation";

// Customers are added by their organisation (module-access-plan.md, M2), so there
// is no public sign-up. Old links land on the sign-in page.
export default function SignupPage() {
  redirect("/login");
}
