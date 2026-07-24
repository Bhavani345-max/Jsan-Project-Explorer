import type { Metadata } from "next";
import { AssistantChat } from "@/components/AssistantChat";

export const metadata: Metadata = {
  title: "AI Assistant · Project Discovery Portal",
  description: "Ask anything, find opportunities, and generate slides, PDFs and images.",
};

export default function AssistantPage() {
  return <AssistantChat />;
}
