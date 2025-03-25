import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  Text,
  Toast,
  Frame,
  BlockStack,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { json } from "@remix-run/node";
import { useSubmit, useLoaderData, useActionData, useNavigate } from "@remix-run/react";
import { authenticate } from "../shopify.server";

// 加载环境变量中的roadmap ID，如果有的话
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  // 尝试从metafield中获取已保存的roadmap ID
  let roadmapId = "";
  
  try {
    const response = await admin.graphql(`
      query {
        shop {
          metafield(namespace: "roadmap", key: "settings") {
            value
          }
        }
      }
    `);
    
    const responseJson = await response.json();
    
    if (responseJson.data?.shop?.metafield?.value) {
      const settings = JSON.parse(responseJson.data.shop.metafield.value);
      roadmapId = settings.roadmapId || "";
    }
  } catch (error) {
    console.error("Error loading metafield:", error);
  }
  
  // 如果metafield中没有找到，则尝试使用环境变量中的默认值
  if (!roadmapId && process.env.ROADMAP_ID) {
    roadmapId = process.env.ROADMAP_ID;
  }
  
  // 如果环境变量也没有，则使用默认值
  if (!roadmapId) {
    roadmapId = "676937a32efc0b9e53a85a40";
  }
  
  
  return json({ roadmapId });
};

// 保存roadmap ID到metafield
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const roadmapId = formData.get("roadmapId");
  
  try {
    // 首先获取商店ID
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
        }
      }
    `);
    
    const shopData = await shopResponse.json();
    const shopId = shopData.data.shop.id;
    
    // 创建或更新metafield
    const response = await admin.graphql(`
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            key
            namespace
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        metafields: [
          {
            namespace: "roadmap",
            key: "settings",
            value: JSON.stringify({
              roadmapId: roadmapId || "",
              updatedAt: new Date().toISOString()
            }),
            type: "json",
            ownerId: shopId
          }
        ]
      }
    });
    
    const responseJson = await response.json();
    
    if (responseJson.data?.metafieldsSet?.userErrors?.length > 0) {
      return json({ 
        status: "error", 
        message: responseJson.data.metafieldsSet.userErrors[0].message 
      });
    }
    
    return json({ status: "success", message: "Roadmap ID 已成功保存" });
  } catch (error) {
    console.error("保存 metafield 时出错:", error);
    return json({ status: "error", message: "保存 Roadmap ID 时出错: " + error.message });
  }
};

export default function Index() {
  const { roadmapId: initialRoadmapId } = useLoaderData();
  const actionData = useActionData();
  const [roadmapId, setRoadmapId] = useState(initialRoadmapId || "");
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);
  const submit = useSubmit();
  
  // 当action返回结果时显示toast通知
  useEffect(() => {
    if (actionData?.status) {
      setToastMessage(actionData.message);
      setToastError(actionData.status === "error");
      setToastActive(true);
    }
  }, [actionData]);
  
  const handleSubmit = useCallback(() => {
    submit(
      { roadmapId },
      { method: "post" }
    );
  }, [roadmapId, submit]);
  
  const toggleToast = useCallback(() => setToastActive((active) => !active), []);
  
  return (
    <Frame>
      <Page title="Roadmap Settings">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="p" variant="bodyMd">
                  请输入您的 Roadmap Space ID，它将被保存到商店的 metafield 中，以便在主题中使用。
                </Text>
                <FormLayout>
                  <TextField
                    label="Roadmap ID"
                    value={roadmapId}
                    onChange={setRoadmapId}
                    autoComplete="off"
                    helpText="在 Roadmap Space 中创建公共路线图后，可以找到此 ID"
                  />
                  <Button primary onClick={handleSubmit}>保存</Button>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        {toastActive && (
          <Toast
            content={toastMessage}
            error={toastError}
            onDismiss={toggleToast}
          />
        )}
      </Page>
    </Frame>
  );
}
