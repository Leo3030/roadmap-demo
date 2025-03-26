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

// Load Roadmap ID from environment variables if available
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  // Try to get saved roadmap ID from metafield
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
  
  // If not found in metafield, try using default value from environment variables
  if (!roadmapId && process.env.ROADMAP_ID) {
    roadmapId = process.env.ROADMAP_ID;
  }
  
  // If environment variable is also not available, use default value
  if (!roadmapId) {
    roadmapId = "676937a32efc0b9e53a85a40";
  }
  
  
  return json({ roadmapId, iframeUrl });
};

// Save roadmap ID to metafield
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const roadmapId = formData.get("roadmapId");
  const iframeUrl = formData.get("iframeUrl");
  
  try {
    // First get the shop ID
    const shopResponse = await admin.graphql(`
      query {
        shop {
          id
        }
      }
    `);
    
    const shopData = await shopResponse.json();
    const shopId = shopData.data.shop.id;
    
    // Create or update metafield
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
    
    return json({ status: "success", message: "Settings have been saved successfully" });
  } catch (error) {
    console.error("Error saving metafield:", error);
    return json({ status: "error", message: "Error saving settings: " + error.message });
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
  
  // Display toast notification when action returns a result
  useEffect(() => {
    if (actionData?.status) {
      setToastMessage(actionData.message);
      setToastError(actionData.status === "error");
      setToastActive(true);
    }
  }, [actionData]);
  
  // Validate if Roadmap ID is valid
  const validateRoadmapId = useCallback(async (id) => {
    if (!id) {
      setToastMessage("Please enter a Roadmap ID");
      setToastError(true);
      setToastActive(true);
      return false;
    }

    setIsValidating(true);
    
    // Choose the correct API environment based on iframeUrl
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
        // Try to get error message
        let errorMessage = "Invalid Roadmap ID";
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          // Unable to parse error JSON, use default message
        }
        
        setToastMessage(`Validation failed: ${errorMessage}`);
        setToastError(true);
        setToastActive(true);
        return false;
      }
    } catch (error) {
      console.error("Error validating Roadmap ID:", error);
      setToastMessage("Error validating Roadmap ID: " + (error.message || "Network error"));
      setToastError(true);
      setToastActive(true);
      return false;
    } finally {
      setIsValidating(false);
    }
  }, [iframeUrl]);
  
  const handleSubmit = useCallback(async () => {
    // First validate Roadmap ID
    const isValid = await validateRoadmapId(roadmapId);
    
    // Only submit the form if validation passes
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
                  Enter your Roadmap Space ID and iframe URL. These will be saved to your store's metafield for use in your theme.
                </Text>
                <FormLayout>
                  <TextField
                    label="Roadmap ID"
                    value={roadmapId}
                    onChange={setRoadmapId}
                    autoComplete="off"
                    helpText="You can find this ID after creating a public roadmap in Roadmap Space"
                    error={toastError && toastActive ? toastMessage : undefined}
                  />
                  <TextField
                    label="Iframe URL"
                    value={iframeUrl}
                    onChange={setIframeUrl}
                    autoComplete="off"
                    helpText="URL for loading the Roadmap widget"
                  />
                  <Button 
                    primary 
                    onClick={handleSubmit} 
                    loading={isValidating}
                    disabled={isValidating}
                  >
                    {isValidating ? "Validating..." : "Save"}
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
