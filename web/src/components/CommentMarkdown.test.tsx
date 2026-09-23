import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CommentMarkdown } from "./CommentMarkdown";

function renderBody(body: string) {
  return render(<CommentMarkdown body={body} />).container;
}

describe("CommentMarkdown", () => {
  it("renders a plain comment as a single paragraph", () => {
    const el = renderBody("why is this here?");
    expect(el.querySelectorAll("p")).toHaveLength(1);
    expect(el.querySelector("p")).toHaveTextContent("why is this here?");
  });

  it("keeps single line breaks inside a paragraph", () => {
    const el = renderBody("first line\nsecond line");
    expect(el.querySelector("p")?.textContent).toBe("first line\nsecond line");
  });

  it("renders inline code", () => {
    const el = renderBody("call `findAdjacentComment` here");
    expect(el.querySelector("p code")).toHaveTextContent("findAdjacentComment");
  });

  it("renders a fenced code block, with or without a language tag", () => {
    const el = renderBody("```ts\nconst x = 1;\nconst y = 2;\n```");
    const code = el.querySelector("pre code");
    expect(code?.textContent).toBe("const x = 1;\nconst y = 2;\n");
    expect(renderBody("```\nplain\n```").querySelector("pre code")).toHaveTextContent("plain");
  });

  it("renders a block quote", () => {
    const el = renderBody("> quoted text\n\nmy reply");
    expect(el.querySelector("blockquote")).toHaveTextContent("quoted text");
    expect(el.querySelector(":scope > .comment-markdown > p")).toHaveTextContent("my reply");
  });

  it("renders bullet and numbered lists", () => {
    const el = renderBody("- one\n- two\n\n1. first\n2. second");
    expect(el.querySelectorAll("ul li")).toHaveLength(2);
    expect(el.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("opens links in a new tab", () => {
    const link = renderBody("see [docs](https://example.com)").querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("shows raw HTML as text instead of rendering it", () => {
    const el = renderBody("<script>alert(1)</script> and <b>bold</b>");
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("b")).toBeNull();
    expect(el).toHaveTextContent("<script>alert(1)</script> and <b>bold</b>");
  });
});
