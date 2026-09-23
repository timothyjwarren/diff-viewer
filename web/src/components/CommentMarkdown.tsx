import Markdown, { type Components } from "react-markdown";

interface MdNode {
  type: string;
  children?: MdNode[];
}

/**
 * Remark plugin that turns raw HTML nodes into plain text, so markup typed
 * into a comment is shown literally instead of being rendered or dropped.
 */
function htmlAsText() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (node.type === "html") node.type = "text";
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
};

/** Renders a comment body as Markdown (CommonMark, no raw HTML). */
export function CommentMarkdown({ body }: { body: string }) {
  return (
    <div className="comment-markdown">
      <Markdown remarkPlugins={[htmlAsText]} components={components}>{body}</Markdown>
    </div>
  );
}
