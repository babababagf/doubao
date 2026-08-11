const instruction =
  "必须先调用 Web Search 工具检索用户问题词本身，禁止仅凭模型记忆回答；未实际联网搜索时不得给出结论。检索范围是模型可访问的公开互联网信息，不得宣称已覆盖或未覆盖任何特定平台（包括今日头条、抖音）；是否命中特定平台以实际返回来源链接为准。仅基于公开信息，用一句不超过20个汉字的结论回答；不得编造企业名称、资质、排名、联系方式或收录结论。";

export function doubaoCheckInput(question: string) {
  return [
    {
      type: "message" as const,
      role: "developer" as const,
      content: instruction,
    },
    { type: "message" as const, role: "user" as const, content: question },
  ];
}
