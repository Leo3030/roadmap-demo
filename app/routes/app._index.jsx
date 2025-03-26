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
import { useSubmit, useLoaderData, useActionData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

// 加载环境变量中的roadmap ID，如果有的话
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  // 尝试从metafield中获取已保存的roadmap ID
  let roadmapId = "";
  let iframeUrl = "https://cdn.roadmap-dev.space/widget/roadmap.js";
  
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
      iframeUrl = settings.iframeUrl || "https://cdn.roadmap-dev.space/widget/roadmap.js";
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
  
  
  return json({ roadmapId, iframeUrl });
};

// 保存roadmap ID到metafield
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const roadmapId = formData.get("roadmapId");
  const iframeUrl = formData.get("iframeUrl");
  
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
              iframeUrl: iframeUrl || "https://cdn.roadmap-dev.space/widget/roadmap.js",
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
    
    return json({ status: "success", message: "设置已成功保存" });
  } catch (error) {
    console.error("保存 metafield 时出错:", error);
    return json({ status: "error", message: "保存设置时出错: " + error.message });
  }
};

export default function Index() {
  const { roadmapId: initialRoadmapId, iframeUrl: initialIframeUrl } = useLoaderData();
  const actionData = useActionData();
  const [roadmapId, setRoadmapId] = useState(initialRoadmapId || "");
  const [iframeUrl, setIframeUrl] = useState(initialIframeUrl || "https://cdn.roadmap-dev.space/widget/roadmap.js");
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastError, setToastError] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  
  const submit = useSubmit();
  
  // 当action返回结果时显示toast通知
  useEffect(() => {
    if (actionData?.status) {
      setToastMessage(actionData.message);
      setToastError(actionData.status === "error");
      setToastActive(true);
    }
  }, [actionData]);
  
  // 验证Roadmap ID是否有效
  const validateRoadmapId = useCallback(async (id) => {
    if (!id) {
      setToastMessage("请输入Roadmap ID");
      setToastError(true);
      setToastActive(true);
      return false;
    }

    setIsValidating(true);
    
    // 根据iframeUrl选择正确的API环境
    const isProd = iframeUrl === "https://cdn.roadmap.space/widget/roadmap.js";
    const apiBaseUrl = isProd 
      ? "https://app.roadmap.space" 
      : "https://app.roadmap-dev.space";
    
    try {
      const response = await fetch(`${apiBaseUrl}/v1/roadmaps/${id}/public`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (response.ok) {
        return true;
      } else {
        // 尝试获取错误信息
        let errorMessage = "无效的Roadmap ID";
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          // 无法解析错误JSON，使用默认消息
        }
        
        setToastMessage(`验证失败: ${errorMessage}`);
        setToastError(true);
        setToastActive(true);
        return false;
      }
    } catch (error) {
      console.error("验证Roadmap ID时出错:", error);
      setToastMessage("验证Roadmap ID时出错: " + (error.message || "网络错误"));
      setToastError(true);
      setToastActive(true);
      return false;
    } finally {
      setIsValidating(false);
    }
  }, [iframeUrl]);
  
  const handleSubmit = useCallback(async () => {
    // 先验证Roadmap ID
    const isValid = await validateRoadmapId(roadmapId);
    
    // 如果验证通过，才提交表单
    if (isValid) {
      submit(
        { roadmapId, iframeUrl },
        { method: "post" }
      );
    }
  }, [roadmapId, iframeUrl, submit, validateRoadmapId]);
  
  const toggleToast = useCallback(() => setToastActive((active) => !active), []);
  
  return (
    <Frame>
      <Page title="Roadmap Settings">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="p" variant="bodyMd">
                  请输入您的 Roadmap Space ID 和 iframe URL，它们将被保存到商店的 metafield 中，以便在主题中使用。
                </Text>
                <FormLayout>
                  <TextField
                    label="Roadmap ID"
                    value={roadmapId}
                    onChange={setRoadmapId}
                    autoComplete="off"
                    helpText="在 Roadmap Space 中创建公共路线图后，可以找到此 ID"
                    error={toastError && toastActive ? toastMessage : undefined}
                  />
                  <TextField
                    label="Iframe URL"
                    value={iframeUrl}
                    onChange={setIframeUrl}
                    autoComplete="off"
                    helpText="用于加载 Roadmap 小部件的 URL"
                  />
                  <Button 
                    primary 
                    onClick={handleSubmit} 
                    loading={isValidating}
                    disabled={isValidating}
                  >
                    {isValidating ? "验证中..." : "保存"}
                  </Button>
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
