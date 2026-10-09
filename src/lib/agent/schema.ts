import {z} from "zod";
import {AGENT_LIMITS} from "./limits.ts";

export const agentResearchSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Question cannot be empty.")
    .max(AGENT_LIMITS.maxQuestionChars, `Question exceeds ${AGENT_LIMITS.maxQuestionChars} characters.`),
  documentIds: z
    .array(z.string().uuid("Invalid document ID."))
    .min(AGENT_LIMITS.minDocuments, `Select at least ${AGENT_LIMITS.minDocuments} document.`)
    .max(AGENT_LIMITS.maxDocuments, `Select at most ${AGENT_LIMITS.maxDocuments} documents.`),
  conversationId: z.string().uuid().optional()
});

export type AgentResearchInput = z.infer<typeof agentResearchSchema>;
