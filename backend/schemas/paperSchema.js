import { z } from 'zod';

export const DIFFICULTIES = ['medium', 'hard', 'very_hard'];
export const SECTION1_CATEGORIES = ['aptitude', 'reasoning', 'verbal'];
export const SECTION2_SUBJECTS = ['CC01', 'CC02', 'CC03', 'CC04', 'CC05'];
export const SNIPPET_LANGUAGES = ['c', 'cpp', 'java', 'python'];
export const REFERENCE_LANGUAGES = ['cpp', 'python'];
export const CODING_TEST_KINDS = [
  'general',
  'boundary',
  'max',
  'single',
  'disconnected',
  'duplicate',
  'corner',
];

export const mcqSchema = z.object({
  id: z.string().min(1),
  type: z.literal('mcq'),
  category: z.string().min(1),
  topic: z.string().min(1),
  difficulty: z.enum(['medium', 'hard', 'very_hard']),
  marks: z.number(),
  text: z.string().min(1),
  options: z.array(z.string()).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
});

export const snippetSchema = mcqSchema.extend({
  type: z.literal('snippet'),
  language: z.enum(['c', 'cpp', 'java', 'python']),
  code: z.string().min(1),
});

export const codingSampleSchema = z.object({
  input: z.string(),
  output: z.string(),
  explanation: z.string().min(1),
});

export const inputGeneratorSchema = z.object({
  language: z.literal('python'),
  code: z.string().min(1),
});

export const codingTestSchema = z
  .object({
    id: z.string().min(1),
    input: z.string().optional(),
    inputGenerator: inputGeneratorSchema.optional(),
    expectedOutput: z.string(),
    marks: z.number(),
    kind: z.enum(['general', 'boundary', 'max', 'single', 'disconnected', 'duplicate', 'corner']),
  })
  .passthrough();

export const codingSchema = z.object({
  id: z.enum(['S2A-01', 'S2A-02']),
  type: z.literal('coding'),
  title: z.string().min(1),
  difficulty: z.enum(['medium', 'hard']),
  domain: z.string().min(1),
  isTreeOrGraph: z.boolean(),
  topic: z.string().min(1),
  marks: z.number(),
  statement: z.string().min(1),
  inputFormat: z.string().min(1),
  outputFormat: z.string().min(1),
  constraints: z.string().min(1),
  timeLimitMs: z.number().int(),
  memoryLimitMb: z.number().int(),
  samples: z.array(codingSampleSchema),
  tests: z.array(codingTestSchema),
  referenceSolution: z.object({
    language: z.enum(['cpp', 'python']),
    code: z.string().min(1),
  }),
  explanation: z.string().min(1),
});

export const section1Schema = z.object({
  questions: z.array(mcqSchema),
});

export const section2Schema = z.object({
  departmentMcqs: z.array(mcqSchema),
  snippets: z.array(snippetSchema),
});

export const section2aSchema = z.object({
  questions: z.array(codingSchema),
});

const baseMetadataShape = {
  format: z.literal('PETDRAFT'),
  version: z.literal(1),
  paperId: z.string().min(1),
  title: z.string().min(1),
  generatedBy: z.string().min(1),
  createdOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'createdOn must use YYYY-MM-DD format'),
};

export const partASchema = z.object({
  ...baseMetadataShape,
  part: z.literal('A'),
  section1: section1Schema,
});

export const partBSchema = z.object({
  ...baseMetadataShape,
  part: z.literal('B'),
  section2: section2Schema,
});

export const partCSchema = z.object({
  ...baseMetadataShape,
  part: z.literal('C'),
  section2a: section2aSchema,
});

export const fullPaperSchema = z.object({
  ...baseMetadataShape,
  part: z.literal('full'),
  section1: section1Schema,
  section2: section2Schema,
  section2a: section2aSchema,
});
