import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const resolver = new Resolver();

resolver.define('runRiskAnalysis', async (req) => {
  const issueKey = req.context.extension.issue.key;

  const issueRes = await api.asApp().requestJira(
    route`/rest/api/3/issue/${issueKey}?fields=summary,description,customfield_10554`
  );
  const issueData = await issueRes.json();

  const summary = issueData.fields.summary;
  const description = extractPlainText(issueData.fields.description);

  const apiUrl = process.env.RISK_API_URL;
  const token = process.env.API_TOKEN;


  const apiResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    },
    body: JSON.stringify({ summary, description })
  });


  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    throw new Error(`API call failed: ${apiResponse.status} - ${errorText}`);
  }

  const apiData = await apiResponse.json();
  const aIriskText = apiData.risk;

  // const bodyData = {
  //   fields: {
  //     customfield_10554: {
  //       type: 'doc',
  //       version: 1,
  //       content: [
  //         {
  //           type: 'paragraph',
  //           content: [
  //             {
  //               type: 'text',
  //               text: aIriskText
  //             }
  //           ]
  //         }
  //       ]
  //     }
  //   }
  // };

  // const bodyData = {
  //   fields: {
  //     customfield_10554: {
  //       type: 'doc',
  //       version: 1,
  //       content: aIriskText.split('\n').map(line => {
  //         if (line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.')) {
  //           return {
  //             type: 'paragraph',
  //             content: [
  //               {
  //                 type: 'text',
  //                 text: line.trim(),
  //                 marks: [{ type: 'strong' }]
  //               }
  //             ]
  //           };
  //         } else {
  //           return {
  //             type: 'paragraph',
  //             content: [
  //               {
  //                 type: 'text',
  //                 text: line.trim()
  //               }
  //             ]
  //           };
  //         }
  //       })
  //     }
  //   }
  // };

  function toAtlassianDocFormat(text) {
    const lines = text.trim().split('\n');
    const content = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Empty line? Add a spacer paragraph
      if (!trimmed) {
        content.push({ type: 'paragraph', content: [] });
        continue;
      }

      // Bold specific section headings
      if (
        trimmed === 'Risk Summary:' ||
        trimmed === 'Risks:' ||
        trimmed === 'Missing Information:'
      ) {
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: trimmed, marks: [{ type: 'strong' }] }]
        });
      } else {
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: trimmed }]
        });
      }
    }

    return {
      type: 'doc',
      version: 1,
      content
    };
  }

  const bodyData = {
    fields: {
      customfield_10554: toAtlassianDocFormat(aIriskText)
    }
  };




  await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}`, {
    method: 'PUT',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyData)
  });

  return { status: 'success' };
});

function extractPlainText(desc) {
  if (!desc?.content) return '';
  return desc.content
    .flatMap((c) => c.content || [])
    .map((d) => d.text || '')
    .join(' ')
    .trim();
}

export const handler = resolver.getDefinitions();
