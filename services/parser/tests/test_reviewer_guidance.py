import unittest

from app.services.llm import apply_reviewer_guidance


class ReviewerGuidanceTests(unittest.TestCase):
    def test_guidance_is_added_to_markdown_and_json(self) -> None:
        data: dict = {}
        markdown = "## Artifact\n\n### Visual summary\nA document capture."

        result = apply_reviewer_guidance(markdown, data, "Focus on the blue signature placement box.")

        self.assertIn("### Reviewer guidance", result)
        self.assertIn("Focus on the blue signature placement box.", result)
        self.assertEqual(data["reviewer_notes"], "Focus on the blue signature placement box.")
        self.assertTrue(data["reviewer_guidance"]["provided"])
        self.assertEqual(data["reviewer_guidance"]["strength"], "strong_focus_guidance_not_full_override")

    def test_existing_guidance_section_is_not_duplicated(self) -> None:
        data: dict = {}
        markdown = "## Artifact\n\n### Reviewer guidance\nExisting guidance."

        result = apply_reviewer_guidance(markdown, data, "Existing guidance.")

        self.assertEqual(result.count("### Reviewer guidance"), 1)
        self.assertTrue(data["reviewer_guidance"]["provided"])

    def test_exact_notes_are_preserved_when_model_rephrases_guidance(self) -> None:
        data: dict = {}
        markdown = "## Artifact\n\n### Reviewer guidance\nThe model summarized this too loosely."

        result = apply_reviewer_guidance(markdown, data, "Focus on the blue box as a signature drag target.")

        self.assertEqual(result.count("### Reviewer guidance"), 1)
        self.assertIn("### Source reviewer notes", result)
        self.assertIn("Focus on the blue box as a signature drag target.", result)


if __name__ == "__main__":
    unittest.main()
