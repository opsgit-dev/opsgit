import { Nav, Footer } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import { Story } from "@/components/Story";
import { HowItWorks } from "@/components/HowItWorks";
import { PullRequest } from "@/components/PullRequest";
import { Features } from "@/components/Features";
import { Packages } from "@/components/Packages";
import { Security } from "@/components/Security";
import { Pricing } from "@/components/Pricing";

export default function Page() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <Stats />
        <Story />
        <HowItWorks />
        <PullRequest />
        <Features />
        <Packages />
        <Security />
        <Pricing />
      </main>
      <Footer />
    </>
  );
}
